import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ExpenseInput {
  description: string;
  amount: number;
  paidBy: string;
  splitBetween: string[];
  groupId?: string;
}

interface SettlementInput {
  from: string;
  to: string;
  amount: number;
  groupId?: string;
}

export function useCreateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newExpense: ExpenseInput) => {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExpense),
      });
      if (!res.ok) throw new Error('Failed to create expense');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
      toast.success('Expense created successfully!');
    },
    onError: () => {
      toast.error('Failed to create expense. Please try again.');
    },
  });
}

export function useSettleBalance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settlement: SettlementInput) => {
      const res = await fetch('/api/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settlement),
      });
      if (!res.ok) throw new Error('Failed to settle balance');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balances'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Settlement recorded successfully!');
    },
    onError: () => {
      toast.error('Failed to process settlement. Please try again.');
    },
  });
}
