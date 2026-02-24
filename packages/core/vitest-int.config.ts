import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.int.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**"],
      reporter: [["json", { file: "coverage-int.json" }]],
    },
    reporters: ["default", ["junit", { outputFile: "int-junit.xml" }]],
  },
});
