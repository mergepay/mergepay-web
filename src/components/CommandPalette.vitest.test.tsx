import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CommandPalette } from "./CommandPalette";

const mockPush = vi.fn();
const mockPathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/auth-store", () => ({
  useAuth: () => ({ user: { displayName: "Test User", stellarPublicKey: "GBA..." } }),
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn() },
}));

function renderCommandPalette(open = true) {
  const onClose = vi.fn();
  return {
    onClose,
    ...render(
      <CommandPalette open={open} onClose={onClose} />
    ),
  };
}

function triggerKey(key: string, opts?: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
}

function pressKeyOnInput(input: HTMLElement, key: string) {
  fireEvent.keyDown(input, new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
  });

  it("renders correctly when open", () => {
    renderCommandPalette();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/search navigation/i)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    renderCommandPalette(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("has aria-modal=\"true\" on the dialog", () => {
    renderCommandPalette();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("filters navigation items by query", async () => {
    renderCommandPalette();
    const input = screen.getByLabelText(/search navigation/i);
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "groups" } });
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /dashboard/i })).not.toBeInTheDocument();
      expect(screen.getByRole("option", { name: /groups/i })).toBeInTheDocument();
    });
  });

  it("shows all items when query is empty", () => {
    renderCommandPalette();
    expect(screen.getByRole("option", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /groups/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /anchors/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /history/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /settings/i })).toBeInTheDocument();
  });

  it("executes navigation on Enter", async () => {
    const { onClose } = renderCommandPalette();
    await waitFor(() => {
      const input = screen.getByLabelText(/search navigation/i) as HTMLInputElement;
      input.blur();
    });

    triggerKey("Enter");
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape via Dialog", () => {
    const { onClose } = renderCommandPalette();
    triggerKey("Escape");
    expect(onClose).toHaveBeenCalled();
  });

  it("filters items but does not navigate when typing in input", () => {
    renderCommandPalette();
    const input = screen.getByLabelText(/search navigation/i) as HTMLInputElement;
    pressKeyOnInput(input, "ArrowDown");
    pressKeyOnInput(input, "Enter");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigates on Enter when input is not focused", () => {
    renderCommandPalette();
    triggerKey("Enter");
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("does not trigger ArrowDown shortcut when input is focused", () => {
    const { onClose } = renderCommandPalette();
    const input = screen.getByLabelText(/search navigation/i) as HTMLInputElement;
    input.focus();
    pressKeyOnInput(input, "ArrowDown");
    expect(mockPush).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not trigger ArrowDown when active element is contenteditable", () => {
    const { onClose } = renderCommandPalette();
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.appendChild(editable);
    editable.focus();

    pressKeyOnInput(editable, "ArrowDown");
    expect(mockPush).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    document.body.removeChild(editable);
  });
});
