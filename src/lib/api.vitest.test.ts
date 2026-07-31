import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiRequestError, resetSessionExpired } from "./api";

describe("API error mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetSessionExpired();
  });

  it("extracts code, message, and status from the nested error shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "SETTLEMENT_FAILED", message: "The transaction was rejected" } }),
          { status: 422, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await expect(api.getExpense("expense-1")).rejects.toMatchObject({
      code: "SETTLEMENT_FAILED",
      message: "The transaction was rejected",
      status: 422,
    });
    await expect(api.getExpense("expense-1")).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("uses safe defaults for malformed error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not-json", { status: 500 }))
    );

    await expect(api.getExpense("expense-1")).rejects.toMatchObject({
      code: "unknown",
      message: "Request failed (500)",
      status: 500,
    });
  });
});
