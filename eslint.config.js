import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import astroParser from "astro-eslint-parser";
import tsParser from "@typescript-eslint/parser";

export default [
  // Base JS recommended config
  js.configs.recommended,

  // Astro recommended rules
  ...astro.configs.recommended,

  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["**/*.astro"],
    languageOptions: {
      parser: astroParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: [".astro"],
      },
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      astro,
    },
  },
];
