import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Build output
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / vendored — not our source, and huge (was producing ~200k lint
    // problems on its own)
    ".amplify/**",
    "amplify_outputs*.json",
    "node_modules/**",
    "coverage/**",
    "**/*.d.ts",
  ]),
  {
    rules: {
      // `any` is tracked debt (the data layer still uses it heavily). Keep it a
      // warning so it's visible but doesn't block the build; paid down
      // separately by typing the data layer.
      "@typescript-eslint/no-explicit-any": "warn",
      // Newer React-Compiler lint rules — useful signals but require dedicated
      // refactors (nested components, effect/ref patterns). Keep as warnings so
      // they're visible without blocking. rules-of-hooks stays an error.
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
