import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";

// Minimal flat config for the scripts and the canary. The kit import (lane S1)
// extends it with the Svelte rules and the kit boundaries.
export default ts.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.svelte-kit/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
