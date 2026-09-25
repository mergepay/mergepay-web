import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpenseReceiptModal } from "./ExpenseReceiptModal";
import type { Expense } from "@/lib/types";

// Mock qrcode.react to avoid canvas issues in jsdom
vi.mock("qrcode.react", () => ({
  QRCodeCanvas: ({ value, ...props }: { value: string; [key: string]: unknown }) => (
    <canvas data-testid="qr-code" data-value={value} {...props} />
  ),
}));

// Mock window.location
const mockLocation = { origin: "https://app.mergepay.io" };
Object.defineProperty(window, "location", { value: mockLocation, writable: true });

const expense: Expense = {
  id: "exp-1",
  groupId: "group-1",
  payerUserId: "user-1",
  payer: {
    id: "user-1",
    stellarPublicKey: "GTEST123",
    displayName: "Alice",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  title: "Dinner at the restaurant",
  description: "Group dinner",
  amount: "120.0000000",
  assetCode: "XLM",
  assetIssuer: null,
  splitType: "equal",
  memo: "MP:dinner-8f3a",
  receiptUrl: null,
  createdAt: "2024-06-15T18:30:00.000Z",
  shares: [
    {
      id: "share-1",
      expenseId: "exp-1",
      userId: "user-1",
      user: {
        id: "user-1",
        stellarPublicKey: "GTEST123",
        displayName: "Alice",
        avatarUrl: null,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      shareAmount: "40.0000000",
      status: "settled",
    },
    {
      id: "share-2",
      expenseId: "exp-1",
      userId: "user-2",
      user: {
        id: "user-2",
        stellarPublicKey: "GTEST456",
        displayName: "Bob",
        avatarUrl: null,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      shareAmount: "40.0000000",
      status: "pending",
    },
    {
      id: "share-3",
      expenseId: "exp-1",
      userId: "user-3",
      user: {
        id: "user-3",
        stellarPublicKey: "GTEST789",
        displayName: "Charlie",
        avatarUrl: null,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      shareAmount: "40.0000000",
      status: "pending",
    },
  ],
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("ExpenseReceiptModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ExpenseReceiptModal open={false} onClose={vi.fn()} expense={expense} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders the dialog with expense title when open", () => {
    render(
      <ExpenseReceiptModal open onClose={vi.fn()} expense={expense} />
    );
    expect(
      screen.getByText("Receipt — Dinner at the restaurant")
    ).toBeInTheDocument();
  });

  it("displays expense details", () => {
    render(
      <ExpenseReceiptModal open onClose={vi.fn()} expense={expense} />
    );
    expect(screen.getByText("Dinner at the restaurant")).toBeInTheDocument();
    // Alice appears in both "Paid by" row and split breakdown
    expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("equal")).toBeInTheDocument();
  });

  it("displays the memo", () => {
    render(
      <ExpenseReceiptModal open onClose={vi.fn()} expense={expense} />
    );
    expect(screen.getByText("MP:dinner-8f3a")).toBeInTheDocument();
  });

  it("renders the QR code with the expense link", () => {
    render(
      <ExpenseReceiptModal open onClose={vi.fn()} expense={expense} />
    );
    const qr = screen.getByTestId("qr-code");
    expect(qr).toBeInTheDocument();
    expect(qr.getAttribute("data-value")).toContain("groups/group-1");
    expect(qr.getAttribute("data-value")).toContain("expense=exp-1");
  });

  it("displays split breakdown with all shares", () => {
    render(
      <ExpenseReceiptModal open onClose={vi.fn()} expense={expense} />
    );
    expect(screen.getByText("Split breakdown")).toBeInTheDocument();
    // Alice appears in both "Paid by" row and split breakdown
    expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("shows settled count", () => {
    render(
      <ExpenseReceiptModal open onClose={vi.fn()} expense={expense} />
    );
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("calls onClose when Close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <ExpenseReceiptModal open onClose={onClose} expense={expense} />
    );
    const closeButton = screen.getByRole("button", {
      name: /close receipt/i,
    });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("has a copy link button", () => {
    render(
      <ExpenseReceiptModal open onClose={vi.fn()} expense={expense} />
    );
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("has a copy payload button", () => {
    render(
      <ExpenseReceiptModal open onClose={vi.fn()} expense={expense} />
    );
    expect(screen.getByRole("button", { name: /copy payload/i })).toBeInTheDocument();
  });

  it("copies the expense link to clipboard on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <ExpenseReceiptModal open onClose={vi.fn()} expense={expense} />
    );
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("groups/group-1?expense=exp-1")
      );
    });
  });

  it("copies the receipt payload to clipboard on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <ExpenseReceiptModal open onClose={vi.fn()} expense={expense} />
    );
    fireEvent.click(screen.getByRole("button", { name: /copy payload/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
      const payload = writeText.mock.calls[0][0];
      expect(JSON.parse(payload)).toEqual(
        expect.objectContaining({
          type: "mergepay_expense",
          id: "exp-1",
          title: "Dinner at the restaurant",
        })
      );
    });
  });

  it("shows a view receipt link when receiptUrl is present", () => {
    const expenseWithReceipt = {
      ...expense,
      receiptUrl: "https://example.com/receipt.jpg",
    };
    render(
      <ExpenseReceiptModal open onClose={vi.fn()} expense={expenseWithReceipt} />
    );
    const link = screen.getByRole("link", { name: /view receipt/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com/receipt.jpg");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not show view receipt link when receiptUrl is absent", () => {
    render(
      <ExpenseReceiptModal open onClose={vi.fn()} expense={expense} />
    );
    expect(screen.queryByRole("link", { name: /view receipt/i })).not.toBeInTheDocument();
  });
});
