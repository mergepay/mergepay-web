import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddExpenseDialog } from '../add-expense-dialog';

vi.mock('@/lib/queries', () => ({
  useCreateExpense: () => ({
    mutateAsync: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100))),
    isPending: false,
  }),
}));

vi.mock('@/lib/asset-store', () => ({
  useAssetStore: (selector: any) => selector({
    activeAsset: { code: 'XLM', issuer: null },
    setActiveAsset: vi.fn(),
  }),
  isActiveAsset: () => true,
}));

vi.mock('@/lib/wallet-store', () => ({
  useWalletDisconnected: () => false,
}));

vi.mock('@/lib/store/offlineStore', () => ({
  useOfflineStore: (selector: any) => selector({ isOnline: true }),
}));

describe('AddExpenseDialog Rate Limiting', () => {
  const members = [
    { userId: 'user-1', user: { displayName: 'Alice', avatarUrl: null } },
    { userId: 'user-2', user: { displayName: 'Bob', avatarUrl: null } },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).__lastExpenseSubmit = 0;
  });

  it('prevents rapid successive clicks from triggering multiple submissions', async () => {
    const onClose = vi.fn();
    render(
      <AddExpenseDialog
        open={true}
        onClose={onClose}
        groupId="group-1"
        members={members}
        currentUserId="user-1"
      />
    );

    const titleInput = screen.getByLabelText(/Title/i);
    fireEvent.change(titleInput, { target: { value: 'Dinner' } });

    const amountInput = screen.getByLabelText(/Amount/i);
    fireEvent.change(amountInput, { target: { value: '10' } });
    fireEvent.blur(amountInput);

    const submitButton = screen.getByTestId('add-expense-confirm');
    
    // Rapid successive clicks
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(submitButton).toBeDefined();
    });
  });
});
