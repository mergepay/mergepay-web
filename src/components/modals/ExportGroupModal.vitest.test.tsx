import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { EMPTY_EXPORT_MESSAGE, ExportGroupModal } from "./ExportGroupModal";
import type { Expense, Settlement, User } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ada: User = {
  id: "u1",
  stellarPublicKey: "GADA",
  displayName: "Ada",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
};

const grace: User = {
  ...ada,
  id: "u2",
  stellarPublicKey: "GGRACE",
  displayName: "Grace",
};

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
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
    shares: [
      {
        id: "s1",
        expenseId: "e1",
        userId: "u2",
        user: grace,
        shareAmount: "12.5000000",
        status: "pending",
      },
    ],
    ...overrides,
  };
}

function settlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: "st1",
    groupId: "g1",
    fromUserId: "u2",
    from: grace,
    toUserId: "u1",
    to: ada,
    amount: "12.5000000",
    assetCode: "XLM",
    assetIssuer: null,
    stellarTxHash: null,
    status: "confirmed",
    memo: "MP:LUNCH",
    expenseId: null,
    createdAt: "2026-06-16T10:00:00Z",
    ...overrides,
  };
}

/** jsdom's Blob has no `.text()`, so keep the string parts it was built from. */
class TextBlob extends Blob {
  content: string;
  constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
    super(parts, options);
    this.content = parts.map(String).join("");
  }
}

function renderModal(
  expenses: Expense[],
  settlements: Settlement[],
  { open = true }: { open?: boolean } = {}
) {
  const onClose = vi.fn();
  render(
    <ExportGroupModal
      open={open}
      onClose={onClose}
      groupId="g1"
      groupName="Lagos Trip"
      expenses={expenses}
      settlements={settlements}
    />
  );
  return { onClose };
}

describe("ExportGroupModal (#337)", () => {
  let downloaded: { name: string; blob: Blob } | null;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    downloaded = null;
    vi.stubGlobal("Blob", TextBlob);
    createObjectURL = vi.fn((blob: Blob) => {
      downloaded = { name: "", blob };
      return "blob:mock";
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        if (downloaded) downloaded.name = this.download;
      });
  });

  afterEach(() => {
    clickSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("offers a labelled CSV/JSON choice with CSV preselected and shows record counts", () => {
    renderModal([expense()], [settlement()]);

    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Export group history"
    );
    expect(screen.getByRole("group", { name: /file format/i })).toBeVisible();
    expect(screen.getByRole("radio", { name: /CSV/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /JSON/ })).not.toBeChecked();
    expect(screen.getByText(/1 expense/)).toBeInTheDocument();
    expect(screen.getByText(/1 settlement/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /download CSV/i })
    ).toBeEnabled();
  });

  it("writes a CSV with a header row and RFC 4180 escaping", async () => {
    renderModal(
      [
        expense({
          title: 'Dinner, "with extras"',
          description: null,
          memo: "=1+1",
        }),
      ],
      []
    );

    fireEvent.click(screen.getByRole("button", { name: /download CSV/i }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    const csv = (downloaded?.blob as TextBlob).content;

    expect(csv.split("\r\n")[0]).toContain("Amount");
    expect(csv).toContain('"Dinner, ""with extras"""');
    // Formula prefixes are neutralised so a spreadsheet cannot evaluate them.
    expect(csv).toContain("'=1+1");
    expect(downloaded?.name).toMatch(/^mergepay-lagos-trip-history-\d{8}-\d{6}\.csv$/);
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/^Downloaded mergepay-lagos-trip-history-/)
    );
  });

  it("writes JSON with every participant share when JSON is selected", async () => {
    renderModal([expense()], [settlement()]);

    fireEvent.click(screen.getByRole("radio", { name: /JSON/ }));
    fireEvent.click(screen.getByRole("button", { name: /download JSON/i }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    const data = JSON.parse((downloaded?.blob as TextBlob).content);

    expect(data.group).toEqual({ id: "g1", name: "Lagos Trip" });
    expect(data.expenses[0].title).toBe("Lunch");
    expect(data.expenses[0].shares[0]).toMatchObject({
      displayName: "Grace",
      amount: "12.5000000",
    });
    expect(data.settlements[0].memo).toBe("MP:LUNCH");
    expect(downloaded?.name).toMatch(/\.json$/);
  });

  it("explains that there is nothing to export and disables the download", () => {
    renderModal([], []);

    expect(screen.getByText(EMPTY_EXPORT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download CSV/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /download CSV/i }));
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("closes after a successful download", async () => {
    const { onClose } = renderModal([expense()], []);

    fireEvent.click(screen.getByRole("button", { name: /download CSV/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("renders nothing while closed", () => {
    renderModal([expense()], [], { open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
