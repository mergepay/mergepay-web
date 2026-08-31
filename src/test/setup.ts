// Vitest setup, referenced by `setupFiles` in vitest.config.ts.
//
// Importing the /vitest entry point registers the jest-dom matchers
// (`toBeInTheDocument`, `toBeDisabled`, ...) on Vitest's `expect` *and*
// augments its `Assertion` type, so component tests typecheck as well as run.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// This vitest/jsdom combination does not expose window.localStorage for the
// default opaque origin. Provide a deterministic in-memory implementation so
// stores that persist to localStorage can be exercised in tests.
const localStorageData = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return localStorageData.size;
  },
  clear: () => {
    localStorageData.clear();
  },
  getItem: (key: string) => localStorageData.get(key) ?? null,
  key: (index: number) => Array.from(localStorageData.keys())[index] ?? null,
  removeItem: (key: string) => {
    localStorageData.delete(key);
  },
  setItem: (key: string, value: string) => {
    localStorageData.set(key, String(value));
  },
};
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

// jsdom is shared across tests in a file; unmount between cases so queries
// never match a component left behind by the previous test.
afterEach(() => {
  cleanup();
});
