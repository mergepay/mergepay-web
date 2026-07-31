import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json so route handlers that
    // import shared libs can be tested.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.vitest.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/components/**/*.tsx"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*.vitest.test.ts", "**/*.vitest.test.tsx"],
    },
  },
});
