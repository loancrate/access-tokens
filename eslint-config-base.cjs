const tseslint = require("typescript-eslint");
const importPlugin = require("eslint-plugin-import-x");

/**
 * Shared ESLint configuration factory for all packages in the monorepo.
 *
 * @param {string} tsconfigRootDir - The root directory for tsconfig resolution (typically __dirname)
 * @returns {import("typescript-eslint").ConfigArray} ESLint flat config array
 */
module.exports = function createConfig(tsconfigRootDir) {
  return [
    {
      ignores: ["coverage/**", "dist/**", "node_modules/**", "*.cjs"],
    },
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          project: "./tsconfig.json",
          tsconfigRootDir,
        },
      },
      plugins: {
        import: importPlugin,
      },
      settings: {
        "import-x/internal-regex": "^@access-tokens/",
        "import-x/resolver": {
          typescript: {
            project: "./tsconfig.json",
          },
        },
      },
      rules: {
        "@typescript-eslint/consistent-type-assertions": [
          "warn",
          { assertionStyle: "never" },
        ],
        "@typescript-eslint/no-unused-vars": [
          "warn",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        "import/no-duplicates": "warn",
        "import/no-unresolved": "error",
        "import/order": [
          "warn",
          {
            groups: [
              "builtin",
              "external",
              "internal",
              "parent",
              "sibling",
              "index",
            ],
            alphabetize: {
              order: "asc",
              caseInsensitive: true,
            },
            "newlines-between": "always",
          },
        ],
        "no-console": ["warn", { allow: ["warn", "error"] }],
        "sort-imports": [
          "warn",
          {
            ignoreCase: true,
            ignoreDeclarationSort: true,
            ignoreMemberSort: false,
          },
        ],
      },
    },
  ];
};
