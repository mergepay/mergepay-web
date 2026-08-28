// Vitest setup, referenced by `setupFiles` in vitest.config.ts.
//
// Importing the /vitest entry point registers the jest-dom matchers
// (`toBeInTheDocument`, `toBeDisabled`, ...) on Vitest's `expect` *and*
// augments its `Assertion` type, so component tests typecheck as well as run.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom is shared across tests in a file; unmount between cases so queries
// never match a component left behind by the previous test.
afterEach(() => {
  cleanup();
});
