import { describe, expect, it } from "vitest";
import {
  OPTIMISTIC_EXPENSE_PREFIX,
  isOptimisticExpenseId,
  buildOptimisticExpense,
  insertOptimisticExpense,
  removeOptimisticExpense,
} from "./optimistic";
import type { CreateExpenseRequest, Expense, User } from "./types";

const mockUser: User = {
  id: "user-1",
  stellarPublicKey: "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXRUB",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: "2024-01-01T00:00:00.000Z",
};

const mockRequest: CreateExpenseRequest = {
  title: "Team Lunch",
  amount: "30.0000000",
  assetCode: "USDC",
  splitType: "equal",
  shares: [
    { userId: "user-1" },
    { userId: "user-2" },
  ],
};

function createMockExpense(id: string, title = "Expense"): Expense {
  return {
    id,
    groupId: "group-1",
    payerUserId: "user-1",
    payer: mockUser,
    title,
    description: null,
    amount: "10.0000000",
    assetCode: "USDC",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    shares: [],
  };
}

describe("Optimistic UI updates for expense creation using React Query (#710)", () => {
  it("recognizes client-generated optimistic expense identifiers", () => {
    expect(isOptimisticExpenseId(`${OPTIMISTIC_EXPENSE_PREFIX}abc-123`)).toBe(true);
    expect(isOptimisticExpenseId("server-expense-99")).toBe(false);
  });

  it("builds optimistic expense from request with isOptimistic flag (#710)", () => {
    const expense = buildOptimisticExpense({
      groupId: "group-1",
      request: mockRequest,
      payer: mockUser,
    });

    expect(expense.isOptimistic).toBe(true);
    expect(expense.id.startsWith(OPTIMISTIC_EXPENSE_PREFIX)).toBe(true);
    expect(expense.title).toBe("Team Lunch");
    expect(expense.amount).toBe("30.0000000");
    expect(expense.shares).toHaveLength(2);
  });

  it("inserts optimistic expense at the top of cache during onMutate (#710)", () => {
    const initialCache: { expenses: Expense[] } = {
      expenses: [createMockExpense("server-1", "Coffee")],
    };

    const optimistic = buildOptimisticExpense({
      groupId: "group-1",
      request: mockRequest,
      payer: mockUser,
    });

    const updated = insertOptimisticExpense(initialCache, optimistic);
    expect(updated.expenses).toHaveLength(2);
    expect(updated.expenses[0].id).toBe(optimistic.id);
    expect(updated.expenses[0].isOptimistic).toBe(true);
    expect(updated.expenses[1].id).toBe("server-1");
  });

  it("removes optimistic expense from cache during onError rollback (#710)", () => {
    const optimistic = buildOptimisticExpense({
      groupId: "group-1",
      request: mockRequest,
      payer: mockUser,
    });

    const cacheWithOptimistic: { expenses: Expense[] } = {
      expenses: [optimistic, createMockExpense("server-1", "Coffee")],
    };

    const rolledBack = removeOptimisticExpense(cacheWithOptimistic, optimistic.id);
    expect(rolledBack.expenses).toHaveLength(1);
    expect(rolledBack.expenses[0].id).toBe("server-1");
  });

  it("handles paginated infinite-query cache shapes during optimistic update & rollback (#710)", () => {
    const paginatedCache: { pages: { expenses: Expense[] }[] } = {
      pages: [
        {
          expenses: [createMockExpense("page-1-exp-1", "Old Expense")],
        },
      ],
    };

    const optimistic = buildOptimisticExpense({
      groupId: "group-1",
      request: mockRequest,
      payer: mockUser,
    });

    const inserted = insertOptimisticExpense(paginatedCache, optimistic);
    expect(inserted.pages[0].expenses).toHaveLength(2);
    expect(inserted.pages[0].expenses[0].id).toBe(optimistic.id);

    const rolledBack = removeOptimisticExpense(inserted, optimistic.id);
    expect(rolledBack.pages[0].expenses).toHaveLength(1);
    expect(rolledBack.pages[0].expenses[0].id).toBe("page-1-exp-1");
  });
});
