import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { EMPTY_EXPORT_HINT, GroupExportMenu } from "./GroupExportMenu";
import type { Expense, User } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ada: User = {
  id: "u1",
  stellarPublicKey: "GADA",
  displayName: "Ada",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
};

const expense: Expense = {
  id: "e1",
  groupId: "g1",
  payerUserId: "u1",
  payer: ada,
  title: "Lunch",
  description: null,
  amount: "25.0000000",
  assetCode: "XLM",
  assetIssuer: null,
  splitType: "equal",
  memo: null,
  receiptUrl: null,
  createdAt: "2026-06-15T12:00:00Z",
  shares: [],
};

describe("GroupExportMenu", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let downloaded: { name: string; blob: Blob } | null;

  /** jsdom's Blob has no `.text()`, so keep the string parts it was built from. */
  class TextBlob extends Blob {
    content: string;
    constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
      super(parts, options);
      this.content = parts.map(String).join("");
    }
  }
  const textOf = (blob: Blob | undefined) => (blob as TextBlob | undefined)?.content ?? "";

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    vi.setSystemTime(new Date(2026, 8, 27, 13, 45, 7));
    downloaded = null;
    vi.stubGlobal("Blob", TextBlob);
    createObjectURL = vi.fn((blob: Blob) => {
      downloaded = { name: "", blob };
      return "blob:mock";
    });
    revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      if (downloaded) downloaded.name = this.download;
    });
  });

  afterEach(() => {
    clickSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("is disabled with an explanation when there is nothing to export", () => {
    render(<GroupExportMenu groupId="g1" expenses={[]} settlements={[]} />);
    const trigger = screen.getByRole("button", { name: /export/i });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAccessibleDescription(EMPTY_EXPORT_HINT);
    expect(trigger.parentElement).toHaveAttribute("title", EMPTY_EXPORT_HINT);
  });

  it("opens a menu with CSV and JSON options", () => {
    render(<GroupExportMenu groupId="g1" expenses={[expense]} settlements={[]} />);
    const trigger = screen.getByRole("button", { name: /export/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Export as CSV"),
      expect.stringContaining("Export as JSON"),
    ]);
    expect(items[0]).toHaveFocus();
  });

  it("uses a caller-provided accessible name for the menu (#362)", () => {
    render(
      <GroupExportMenu
        groupId="all"
        expenses={[expense]}
        settlements={[]}
        menuLabel="Export transaction history"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    expect(screen.getByRole("menu")).toHaveAccessibleName(
      "Export transaction history"
    );
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<GroupExportMenu groupId="g1" expenses={[expense]} settlements={[]} />);
    const trigger = screen.getByRole("button", { name: /export/i });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("downloads a timestamped CSV and revokes the object URL", () => {
    render(<GroupExportMenu groupId="g1" groupName="Lagos Trip" expenses={[expense]} settlements={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /csv/i }));

    expect(downloaded?.name).toBe("mergepay-lagos-trip-history-20260927-134507.csv");
    expect(downloaded?.blob.type).toBe("text/csv;charset=utf-8");
    expect(textOf(downloaded?.blob)).toContain("Lunch");
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    expect(toast.success).toHaveBeenCalledWith("Downloaded mergepay-lagos-trip-history-20260927-134507.csv");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("downloads JSON", () => {
    render(<GroupExportMenu groupId="g1" expenses={[expense]} settlements={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /json/i }));

    expect(downloaded?.name).toBe("mergepay-g1-history-20260927-134507.json");
    const data = JSON.parse(textOf(downloaded?.blob));
    expect(data.expenses[0].title).toBe("Lunch");
  });
});
