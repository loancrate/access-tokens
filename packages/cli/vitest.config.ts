import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**"],
      reporter: [["json", { file: "coverage-unit.json" }]],
    },
    reporters: ["default", ["junit", { outputFile: "unit-junit.xml" }]],
  },
});
