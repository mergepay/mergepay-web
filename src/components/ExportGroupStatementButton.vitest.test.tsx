import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ExportGroupStatementButton } from "./ExportGroupStatementButton";
import type { Expense, Settlement, User } from "@/lib/types";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const { toast } = await import("sonner");

const alice: User = {
  id: "u1",
  stellarPublicKey: "GALICE",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
};

const bob: User = {
  id: "u2",
  stellarPublicKey: "GBOB",
  displayName: "Bob",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
};

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    groupId: "g1",
    payerUserId: "u1",
    payer: alice,
    title: "Dinner",
    description: null,
    amount: "40.0000000",
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
        userId: "u1",
        user: alice,
        shareAmount: "20.0000000",
        status: "pending",
      },
    ],
    ...overrides,
  };
}

function makeSettlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: "st1",
    groupId: "g1",
    fromUserId: "u2",
    from: bob,
    toUserId: "u1",
    to: alice,
    amount: "20.0000000",
    assetCode: "XLM",
    assetIssuer: null,
    stellarTxHash: "a".repeat(64),
    status: "confirmed",
    memo: "MP:DINNER",
    expenseId: null,
    createdAt: "2026-06-16T10:00:00Z",
    ...overrides,
  };
}

const createObjectURL = vi.fn(() => "blob:mergepay-statement");
const revokeObjectURL = vi.fn();
let clickSpy: MockInstance;

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);
});

function renderButton(expenses: Expense[], settlements: Settlement[]) {
  return render(
    <ExportGroupStatementButton
      groupId="g1"
      expenses={expenses}
      settlements={settlements}
    />
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
  expect(screen.getByText(/export group statement/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /download csv/i }));
}

/** jsdom's Blob has no `.text()` — read it the FileReader way. */
function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("ExportGroupStatementButton (#377)", () => {
  it("disables the export when there is nothing to export", () => {
    renderButton([], []);
    const trigger = screen.getByRole("button", { name: /export csv/i });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute(
      "title",
      "No expenses or settlements to export yet"
    );
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("keeps the dialog available once there is data and shows the record count", () => {
    renderButton([makeExpense()], []);
    const trigger = screen.getByRole("button", { name: /export csv/i });
    expect(trigger).toBeEnabled();

    fireEvent.click(trigger);
    expect(screen.getByText(/export group statement/i)).toBeInTheDocument();
    expect(screen.getByText(/1 expense/)).toBeInTheDocument();
    expect(screen.getByText(/0 settlements/)).toBeInTheDocument();
  });

  it("refuses to download when the selected range matches nothing", () => {
    renderButton([makeExpense()], [makeSettlement()]);
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    fireEvent.change(screen.getByLabelText(/start date/i), {
      target: { value: "2027-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: /download csv/i }));

    expect(toast.error).toHaveBeenCalledWith(
      "No records match the selected date range"
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("downloads a CSV that escapes commas, quotes and formula prefixes", async () => {
    renderButton(
      [
        makeExpense({ title: 'Dinner, "with extras"', description: "=cmd|'/c calc'!A1" }),
        makeExpense({ id: "e2", title: "Line1\nLine2" }),
      ],
      [makeSettlement()]
    );

    openDialog();

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/exported \d+ records as csv/i)
    );

    const [blob] = createObjectURL.mock.calls[0] as unknown as [Blob];
    const csv = await blobToText(blob);

    // Structural quoting for the comma/quote title.
    expect(csv).toContain('"Dinner, ""with extras"""');
    // The newline title stays inside one quoted cell.
    expect(csv).toContain('"Line1\nLine2"');
    // Formula injection is neutralised with a leading apostrophe.
    expect(csv).toContain("'=cmd|'/c calc'!A1");
    // Every record keeps its header.
    expect(csv.split("\n")[0]).toBeTruthy();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mergepay-statement");
    clickSpy.mockRestore();
  });

  it("writes one row per expense share plus one per settlement", async () => {
    renderButton([makeExpense()], [makeSettlement()]);
    openDialog();

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    const [blob] = createObjectURL.mock.calls[0] as unknown as [Blob];
    const csv = await blobToText(blob);

    // Header + one share row + one settlement row.
    expect(csv.trim().split("\n")).toHaveLength(3);
    // The on-chain memo receipt format is preserved verbatim.
    expect(csv).toContain("MP:DINNER");
  });
});
