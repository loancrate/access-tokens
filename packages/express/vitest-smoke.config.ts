import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.smoke.test.ts"],
    reporters: ["default", ["junit", { outputFile: "smoke-junit.xml" }]],
  },
});
