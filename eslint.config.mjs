import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      ecmaVersion: 2024,
      sourceType: "module",
    },
    rules: {
      curly: ["warn", "multi-line"],
      "dot-notation": "error",
      eqeqeq: "error",
      "no-unused-vars": [
        "warn",
        {
          vars: "all",
          args: "none",
          varsIgnorePattern: "^_$",
        },
      ],
      radix: "error",
    },
  },
];
