import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json so route handlers that
    // import shared libs can be tested.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // tsconfig.json uses `jsx: "preserve"` (Next.js transforms JSX at build
  // time). Vitest has no Next pipeline, so it must transform JSX itself:
  // override the preserved setting via oxc's automatic runtime, which means
  // component tests need no explicit React import.
  oxc: { jsx: { runtime: "automatic" } },
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
