import baseConfig from "./base.js";
import sveltePlugin from "eslint-plugin-svelte";
import globals from "globals";

/**
 * ESLint configuration for Svelte projects
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  ...baseConfig,
  ...sveltePlugin.configs["flat/recommended"],
  ...sveltePlugin.configs["flat/prettier"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // Svelte specific rules
      "svelte/no-at-html-tags": "warn",
      "svelte/valid-compile": "error",
      "svelte/no-unused-svelte-ignore": "error",
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: "@typescript-eslint/parser",
      },
    },
  },
];
