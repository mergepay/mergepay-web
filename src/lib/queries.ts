"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth-store";
import type {
  ConfirmSettlementRequest,
  CreateExpenseRequest,
  CreateGroupRequest,
  CreateSettlementRequest,
  EnableTreasuryRequest,
  InviteRequest,
  SettleExpenseRequest,
  TreasuryDepositRequest,
  TreasuryWithdrawRequest,
  UpdateMeRequest,
} from "./types";

export const qk = {
  me: ["me"] as const,
  groups: ["groups"] as const,
  group: (id: string) => ["groups", id] as const,
  expenses: (groupId: string) => ["groups", groupId, "expenses"] as const,
  balances: (groupId: string) => ["groups", groupId, "balances"] as const,
  ledger: (groupId: string) => ["groups", groupId, "ledger"] as const,
  treasury: (groupId: string) => ["groups", groupId, "treasury"] as const,
  treasuryHistory: (groupId: string) =>
    ["groups", groupId, "treasury", "history"] as const,
  anchors: ["anchors"] as const,
  anchorSessions: ["anchors", "sessions"] as const,
  history: ["history"] as const,
};

export function useMe() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.me,
    queryFn: api.me,
    enabled: Boolean(token),
    staleTime: 60_000,
  });
}

export function useGroups() {
  return useQuery({ queryKey: qk.groups, queryFn: api.listGroups });
}

export function useGroup(id: string) {
  return useQuery({ queryKey: qk.group(id), queryFn: () => api.getGroup(id) });
}

export function useExpenses(groupId: string) {
  return useQuery({
    queryKey: qk.expenses(groupId),
    queryFn: () => api.listExpenses(groupId),
  });
}

export function useBalances(groupId: string) {
  return useQuery({
    queryKey: qk.balances(groupId),
    queryFn: () => api.getBalances(groupId),
  });
}

export function useLedger(groupId: string) {
  return useQuery({
    queryKey: qk.ledger(groupId),
    queryFn: () => api.getLedger(groupId),
  });
}

export function useTreasuryInfo(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.treasury(groupId),
    queryFn: () => api.treasuryInfo(groupId),
    enabled,
  });
}

export function useTreasuryHistory(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.treasuryHistory(groupId),
    queryFn: () => api.treasuryHistory(groupId),
    enabled,
  });
}

export function useAnchors() {
  return useQuery({ queryKey: qk.anchors, queryFn: api.listAnchors });
}

export function useAnchorSessions() {
  return useQuery({
    queryKey: qk.anchorSessions,
    queryFn: api.anchorSessions,
    refetchInterval: 15_000,
  });
}

export function useHistory() {
  return useQuery({ queryKey: qk.history, queryFn: api.history });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function useInvalidator() {
  const qc = useQueryClient();
  return (keys: readonly (readonly unknown[])[]) =>
    Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCreateGroup() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (data: CreateGroupRequest) => api.createGroup(data),
    onSuccess: () => invalidate([qk.groups]),
  });
}

export function useJoinGroup() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (code: string) => api.joinGroup(code),
    onSuccess: () => invalidate([qk.groups]),
  });
}

export function useLeaveGroup(groupId: string) {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: () => api.leaveGroup(groupId),
    onSuccess: () => invalidate([qk.groups]),
  });
}

export function useArchiveGroup(groupId: string) {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: () => api.archiveGroup(groupId),
    onSuccess: () => invalidate([qk.groups, qk.group(groupId)]),
  });
}

export function useCreateInvite(groupId: string) {
  return useMutation({
    mutationFn: (data: InviteRequest) => api.createInvite(groupId, data),
  });
}

export function useCreateExpense(groupId: string) {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (data: CreateExpenseRequest) => api.createExpense(groupId, data),
    onSuccess: () =>
      invalidate([
        qk.expenses(groupId),
        qk.balances(groupId),
        qk.ledger(groupId),
        qk.groups,
      ]),
  });
}

export function useDeleteExpense(groupId: string) {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (expenseId: string) => api.deleteExpense(expenseId),
    onSuccess: () =>
      invalidate([
        qk.expenses(groupId),
        qk.balances(groupId),
        qk.ledger(groupId),
        qk.groups,
      ]),
  });
}

export function useSettleExpense() {
  return useMutation({
    mutationFn: ({
      expenseId,
      data,
    }: {
      expenseId: string;
      data?: SettleExpenseRequest;
    }) => api.settleExpense(expenseId, data),
  });
}

export function useCreateSettlement(groupId: string) {
  return useMutation({
    mutationFn: (data: CreateSettlementRequest) =>
      api.createSettlement(groupId, data),
  });
}

export function useConfirmSettlement(groupId: string) {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: ({
      settlementId,
      data,
    }: {
      settlementId: string;
      data: ConfirmSettlementRequest;
    }) => api.confirmSettlement(settlementId, data),
    onSuccess: () =>
      invalidate([
        qk.expenses(groupId),
        qk.balances(groupId),
        qk.ledger(groupId),
        qk.groups,
        qk.history,
      ]),
  });
}

export function useEnableTreasury(groupId: string) {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (data: EnableTreasuryRequest) =>
      api.enableTreasury(groupId, data),
    onSuccess: () => invalidate([qk.group(groupId), qk.groups]),
  });
}

export function useTreasuryDeposit(groupId: string) {
  return useMutation({
    mutationFn: (data: TreasuryDepositRequest) =>
      api.treasuryDeposit(groupId, data),
  });
}

export function useTreasuryWithdraw(groupId: string) {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (data: TreasuryWithdrawRequest) =>
      api.treasuryWithdraw(groupId, data),
    onSuccess: () =>
      invalidate([qk.treasury(groupId), qk.treasuryHistory(groupId)]),
  });
}

export function useUpdateMe() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (data: UpdateMeRequest) => api.updateMe(data),
    onSuccess: () => invalidate([qk.me]),
  });
}
