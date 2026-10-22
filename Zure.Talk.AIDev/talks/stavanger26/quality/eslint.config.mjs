// Our rules, applied to every run. A run's own eslint config is ignored on purpose.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "**/.claude*/**", "**/.firstmate/**", "**/reports/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "complexity": ["warn", 10],
      "max-depth": ["warn", 4],
      "no-console": "off",
    },
  },
);
