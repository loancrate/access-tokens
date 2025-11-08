import type { Config } from "jest";

interface MakeJestConfigOptions {
  esm?: boolean;
  testSuiteType?: "unit" | "int" | "smoke";
}

export function makeJestConfig(options: MakeJestConfigOptions = {}): Config {
  const { esm = false, testSuiteType = "unit" } = options;

  let testMatch: string[];
  let outputFile: string;

  switch (testSuiteType) {
    case "int":
      testMatch = ["**/__tests__/**/*.int.test.ts"];
      outputFile = "int-junit.xml";
      break;
    case "smoke":
      testMatch = ["**/__tests__/**/*.smoke.test.ts"];
      outputFile = "smoke-junit.xml";
      break;
    case "unit":
    default:
      testMatch = [
        "**/__tests__/**/*.test.ts",
        "!**/__tests__/**/*.int.test.ts",
        "!**/__tests__/**/*.smoke.test.ts",
      ];
      outputFile = "unit-junit.xml";
  }

  const config: Config = {
    preset: "ts-jest",
    testEnvironment: "node",
    testMatch,
    testPathIgnorePatterns: ["/node_modules/", "/dist/"],
    collectCoverage: true,
    coverageDirectory: "coverage",
    coverageReporters: [["json", { file: `coverage-${testSuiteType}.json` }]],
    collectCoverageFrom: ["src/**/*.ts", "!src/**/__tests__/**"],
    reporters: [
      "default",
      ["jest-junit", { outputDirectory: ".", outputName: outputFile }],
    ],
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
    transform: {
      "^.+\\.tsx?$": [
        "ts-jest",
        {
          tsconfig: {
            module: "ES2022",
            moduleResolution: "bundler",
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            isolatedModules: true,
          },
          useESM: esm,
        },
      ],
      "^.+\\.m?js$": [
        "ts-jest",
        {
          tsconfig: {
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
          },
        },
      ],
    },
    transformIgnorePatterns: ["node_modules/(?!(jose)/)"],
  };

  if (esm) {
    config.extensionsToTreatAsEsm = [".ts"];
    config.moduleNameMapper = {
      "^(\\.{1,2}/.*)\\.js$": "$1",
    };
  }

  return config;
}
