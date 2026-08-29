"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { qk, useInvalidator, expenseCacheKeys } from "@/lib/queries";
import { handleApiError } from "@/lib/errorHandler";
import type {
  CreateExpenseRequest,
  CreateSettlementRequest,
  ExpenseResponse,
  SettlementIntentResponse,
} from "@/lib/types";

export function useCreateExpenseMutation(groupId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidator();

  return useMutation({
    mutationFn: (data: CreateExpenseRequest): Promise<ExpenseResponse> => {
      return api.createExpense(groupId, data);
    },
    onSuccess: () => {
      invalidate(expenseCacheKeys(groupId));
      qc.invalidateQueries({ queryKey: qk.activity(groupId) });
      qc.invalidateQueries({ queryKey: qk.history });
      toast.success("Expense created successfully");
    },
    onError: (err) => {
      handleApiError(err, "Failed to create expense");
    },
  });
}

export function useSettleBalanceMutation(groupId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidator();

  return useMutation({
    mutationFn: (data: CreateSettlementRequest): Promise<SettlementIntentResponse> => {
      return api.createSettlement(groupId, data);
    },
    onSuccess: () => {
      invalidate(expenseCacheKeys(groupId));
      qc.invalidateQueries({ queryKey: qk.activity(groupId) });
      qc.invalidateQueries({ queryKey: qk.history });
      toast.success("Settlement executed successfully");
    },
    onError: (err) => {
      handleApiError(err, "Failed to execute settlement");
    },
  });
}
