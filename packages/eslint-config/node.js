import baseConfig from "./base.js";
import globals from "globals";

/**
 * ESLint configuration for Node.js/Bun backend projects
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        Bun: "readonly",
      },
    },
    rules: {
      // Node.js specific rules
      "no-process-exit": "warn",
      "no-console": "off", // Allow console in backend
    },
  },
];
