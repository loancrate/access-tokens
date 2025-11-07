#!/usr/bin/env node
import { run } from "./cli";

(async () => {
  const code = await run({
    argv: process.argv.slice(2),
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exit(code);
})().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
