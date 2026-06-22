import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    // Only run our unit tests for pure modules; never the Next/Amplify app code.
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", ".amplify/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
