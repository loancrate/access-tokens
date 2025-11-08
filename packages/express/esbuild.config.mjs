import { build } from "esbuild";

import pkg from "./package.json" with { type: "json" };

// Get all dependencies except jose (which we want to bundle)
const external = [
  ...Object.keys(pkg.dependencies || {}).filter((dep) => dep !== "jose"),
  ...Object.keys(pkg.peerDependencies || {}),
];

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outdir: "dist",
  sourcemap: true,
  external,
});
