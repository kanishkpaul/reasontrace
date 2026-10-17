import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import { closeInterruptedRuns } from "@reasontrace/core";
import { keychainStore } from "@reasontrace/keys";
import { createApp } from "./app.ts";
import { registry } from "./registry.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const VERSION = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }).version;

const USAGE = `usage: reasontrace [--port N] [--runs DIR] [--dev] [--version]

  --port N     listen on 127.0.0.1:N (default 4317)
  --runs DIR   where run directories go (default ./runs in the repository)
  --dev        API only; the Vite dev server serves the viewer (npm run dev)
  --version    print the version and exit`;

const { values: args } = parseArgs({
  options: {
    port: { type: "string", default: "4317" },
    runs: { type: "string" },
    dev: { type: "boolean", default: false },
    version: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
if (args.version) {
  console.log(`reasontrace ${VERSION}`);
  process.exit(0);
}

// design/system/TUI.md: colour only on a terminal, and never with NO_COLOR set.
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const dim = (text: string) => (tty ? `\u001b[2m${text}\u001b[22m` : text);
const bold = (text: string) => (tty ? `\u001b[1m${text}\u001b[22m` : text);

function fail(message: string, hint: string): never {
  console.error(`error: ${message}`);
  console.error(dim(`  ${hint}`));
  process.exit(1);
}

const port = Number(args.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`not a port: ${args.port}`, "pass a number from 0 to 65535");
const webDir = args.dev ? undefined : join(ROOT, "apps/web/dist");
if (webDir && !existsSync(join(webDir, "index.html"))) fail("the viewer is not built", "run `npm run build`, or `npm start`, which builds first");

const runsDir = resolve(args.runs ?? join(ROOT, "runs"));
const token = process.env.RT_TOKEN ?? randomBytes(24).toString("base64url");
const keys = keychainStore();
const closed = closeInterruptedRuns(runsDir);

const app = createApp({
  token,
  sources: registry({ keys }),
  keys,
  runsDir,
  webDir,
  log: (line) => console.log(line),
  versions: { reasontrace: VERSION, node: process.version },
});

const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, (info) => {
  const url = `http://127.0.0.1:${info.port}`;
  if (process.stdout.isTTY) console.log(bold(" ∴ ReasonTrace "));
  console.log(dim(`reasontrace ${VERSION} · ${args.dev ? "api only" : url} · keys: OS keychain · runs: ${runsDir}`));
  if (closed.length) console.log(dim(`marked ${closed.length} interrupted run${closed.length === 1 ? "" : "s"} as aborted`));
  if (!args.dev) console.log(`open ${url}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") fail(`port ${port} is in use`, "pass --port with another number");
  fail(error.message, "see the cause above");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
