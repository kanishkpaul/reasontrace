#!/usr/bin/env node
// Development: the API server and the Vite dev server, sharing one launch
// token. Vite puts the token in the page and forwards /api to the server, so
// the viewer reaches the API the same way it does when the server serves it.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = process.env.RT_PORT ?? "4317";
const env = { ...process.env, RT_TOKEN: randomBytes(24).toString("base64url"), RT_SERVER: `http://127.0.0.1:${port}` };

const children = [
  spawn(process.execPath, ["apps/server/src/main.ts", "--dev", "--port", port], { env, stdio: "inherit" }),
  spawn("npm", ["run", "dev", "-w", "@reasontrace/web"], { env, stdio: "inherit" }),
];

const stop = (code) => {
  for (const child of children) child.kill("SIGTERM");
  process.exit(code);
};
for (const child of children) child.on("exit", (code) => stop(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(0));
