import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportFilteredCsvButton } from "./ExportFilteredCsvButton";
import * as csv from "@/lib/transactionCsv";
import type { Settlement, User } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const u = (id: string): User => ({
  id,
  displayName: id,
  stellarPublicKey: "",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const settlement: Settlement = {
  id: "s1",
  groupId: "g1",
  fromUserId: "a",
  from: u("a"),
  toUserId: "b",
  to: u("b"),
  amount: "5",
  assetCode: "XLM",
  assetIssuer: null,
  stellarTxHash: null,
  status: "confirmed",
  memo: "MP:x",
  expenseId: null,
  createdAt: "2026-02-01T00:00:00.000Z",
};

beforeEach(() => vi.restoreAllMocks());

describe("ExportFilteredCsvButton", () => {
  it("downloads exactly the filtered items with a filter-aware name", () => {
    const download = vi.spyOn(csv, "downloadCsv").mockImplementation(() => {});
    const items = [{ type: "settlement" as const, item: settlement }];
    render(<ExportFilteredCsvButton items={items} assetCode="XLM" startDate="2026-01-01" filtered />);

    fireEvent.click(screen.getByRole("button", { name: "Export 1 filtered transaction as CSV" }));

    expect(download).toHaveBeenCalledTimes(1);
    const [content, filename] = download.mock.calls[0];
    expect(content).toBe(csv.buildTransactionCsv(items));
    expect(filename).toMatch(/-XLM-from-2026-01-01\.csv$/);
  });

  it("is disabled when no transactions match", () => {
    render(<ExportFilteredCsvButton items={[]} />);
    expect(screen.getByRole("button", { name: /export 0 transactions/i })).toBeDisabled();
  });
});
