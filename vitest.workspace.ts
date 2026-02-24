import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/core",
  "packages/express",
  "packages/client",
  "packages/cli",
]);
