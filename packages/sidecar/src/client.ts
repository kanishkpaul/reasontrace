import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

export interface SidecarCommand {
  command: string;
  args: string[];
  cwd: string;
}

/** What `hello` answers: the runtime's device and versions, or why it can't load. */
export interface Hello {
  protocol: number;
  runtime: { device: string; libraries: Record<string, string> } | null;
  unavailable: string | null;
}

export class SidecarError extends Error {
  /** The JSON-RPC error code, or undefined when the process itself failed. */
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

/** Lines of stderr kept to explain a crash. */
const STDERR_LINES = 20;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onDelta?: (channel: "reasoning" | "output", text: string) => void;
}

/**
 * One sidecar process, speaking JSON-RPC 2.0 with one message per line. The
 * process is started by `start` and lives until `stop` or until it exits;
 * every request still waiting then fails with the reason.
 */
export class Sidecar {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly pending = new Map<number, Pending>();
  private readonly stderr: string[] = [];
  private nextId = 1;
  private exited: Promise<void> = Promise.resolve();
  private readonly command: SidecarCommand;

  constructor(command: SidecarCommand) {
    this.command = command;
  }

  get running(): boolean {
    return this.child !== null;
  }

  /** Starts the process and asks it `hello`. */
  async start(): Promise<Hello> {
    const child = spawn(this.command.command, this.command.args, { cwd: this.command.cwd, stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    this.exited = new Promise((resolve) => {
      const fail = (reason: string) => {
        this.child = null;
        for (const [, pending] of this.pending) pending.reject(new SidecarError(reason));
        this.pending.clear();
        resolve();
      };
      child.on("error", (error: NodeJS.ErrnoException) => {
        fail(error.code === "ENOENT"
          ? `${this.command.command} was not found on PATH, so the Python sidecar can't start. Install uv (docs.astral.sh/uv), then run \`uv sync --extra model\` in bridge/python.`
          : `The Python sidecar couldn't start: ${error.message}`);
      });
      child.on("exit", (code, signal) => {
        const tail = this.stderr.length ? `: ${this.stderr.slice(-5).join(" | ")}` : "";
        fail(`The Python sidecar exited (${signal ?? `code ${code}`})${tail}`);
      });
    });
    // Writing to a process that has died fails with EPIPE; the exit handler reports why it died.
    child.stdin.on("error", () => {});
    createInterface({ input: child.stderr }).on("line", (line) => {
      this.stderr.push(line);
      if (this.stderr.length > STDERR_LINES) this.stderr.shift();
    });
    createInterface({ input: child.stdout }).on("line", (line) => this.receive(line));
    return this.request<Hello>("hello", {});
  }

  request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return this.call<T>(method, params).result;
  }

  /** Sends a request and gives back its ID, which `cancel` takes, with the promise of its result. */
  call<T>(method: string, params: Record<string, unknown>, onDelta?: Pending["onDelta"]): { id: number; result: Promise<T> } {
    const child = this.child;
    const id = this.nextId++;
    if (!child) return { id, result: Promise.reject(new SidecarError("The Python sidecar is not running.")) };
    const result = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, onDelta });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
    return { id, result };
  }

  /** Asks the sidecar to stop the run started by request `id`. */
  cancel(id: number): void {
    this.child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "cancel", params: { id } })}\n`);
  }

  /** Closes stdin, which ends the sidecar's loop, and waits for it to exit. */
  async stop(): Promise<void> {
    this.child?.stdin.end();
    await this.exited;
  }

  private receive(line: string): void {
    let message: { id?: number; method?: string; params?: { id: number; channel: "reasoning" | "output"; text: string }; result?: unknown; error?: { code: number; message: string } };
    try {
      message = JSON.parse(line);
    } catch {
      this.stderr.push(`(not JSON on stdout) ${line.slice(0, 200)}`);
      return;
    }
    if (message.method === "delta" && message.params) {
      this.pending.get(message.params.id)?.onDelta?.(message.params.channel, message.params.text);
      return;
    }
    if (message.id === undefined) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new SidecarError(message.error.message, message.error.code));
    else pending.resolve(message.result);
  }
}
