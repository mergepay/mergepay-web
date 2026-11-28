import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ThemeProvider, useTheme } from "./theme-provider";
import { ThemeToggle } from "./theme-toggle";

function mockMatchMedia(dark: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" ? dark : false,
    media: query,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
      listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
      listeners.delete(cb),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return listeners;
}

function ThemeProbe() {
  const { theme, resolvedTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
    </div>
  );
}

function renderThemed(ui: React.ReactElement = <ThemeProbe />) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("ThemeProvider (#871)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("light", "dark");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to system and resolves light when the OS prefers light", () => {
    mockMatchMedia(false);
    renderThemed();
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("restores a persisted dark preference on load", () => {
    mockMatchMedia(false);
    localStorage.setItem("mergepay-theme", "dark");
    renderThemed();
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("follows system preference changes while in system mode", () => {
    const listeners = mockMatchMedia(false);
    renderThemed();
    expect(document.documentElement.classList.contains("light")).toBe(true);

    act(() => {
      listeners.forEach((cb) =>
        cb({ matches: true } as MediaQueryListEvent)
      );
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("ThemeToggle (#871)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("light", "dark");
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cycles light -> dark -> system and persists each choice", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
        <ThemeProbe />
      </ThemeProvider>
    );

    const btn = screen.getByRole("button", { name: /switch to/i });

    fireEvent.click(btn); // system -> light
    expect(localStorage.getItem("mergepay-theme")).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);

    fireEvent.click(btn); // light -> dark
    expect(localStorage.getItem("mergepay-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(btn); // dark -> system
    expect(localStorage.getItem("mergepay-theme")).toBe("system");
  });
});
