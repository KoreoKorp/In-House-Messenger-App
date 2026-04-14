import js from "@eslint/js";
import security from "eslint-plugin-security";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    // Apply to all JS files
    files: ["**/*.js"],
    languageOptions: {
      // Include node, browser, and commonjs globals
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.commonjs
      }
    },
    plugins: {
      security
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off", // Keep logs for your dev/debugging
      "security/detect-object-injection": "warn",
      "semi": ["error", "always"],
      "quotes": ["error", "single"] // Changed to single quotes as your codebase heavily uses them
    }
  }
];