// Minimal lint gate used by `npm run lint:hooks` (runs in the build).
//
// Purpose: catch React Hooks order violations — e.g. a hook placed after an
// early return, which crashes the page with React error #310 in production —
// BEFORE deploy. The full lint has thousands of pre-existing style errors
// (no-explicit-any, no-this-alias in vendored files, etc.), so those are
// silenced here; this gate fails ONLY on react-hooks/rules-of-hooks.
import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals, // brings the TS parser + JSX + react-hooks plugin setup
  ...nextTs,
  {
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // Silence everything else so the gate is focused and won't trip on
      // pre-existing debt.
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-array-constructor": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react/display-name": "off",
      "react/no-unescaped-entities": "off",
      "prefer-const": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/static-components": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
]);
