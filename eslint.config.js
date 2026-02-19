import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import tsParser from "@typescript-eslint/parser";
import tseslint from "@typescript-eslint/eslint-plugin";

export default [
  // Ignore paths (replacement for .eslintignore in flat config)
  {
    ignores: [
      ".husky/**",
      ".vscode/**",
      "node_modules/**",
      "public/**",
      "dist/**",
      ".vercel/**",
      ".output/**",
      ".astro/**",
      ".yarn/**",
      "src/components/Header.astro",
      "src/layouts/PostDetails.astro",
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // Astro flat config
  ...astro.configs["flat/recommended"],

  // TypeScript files
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": tseslint,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      // TypeScript handles undefined names better than this JS rule.
      "no-undef": "off",
      // TypeScript-aware unused variable checks
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },

  // Astro files (script/frontmatter contexts)
  {
    files: ["**/*.astro"],
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
];
