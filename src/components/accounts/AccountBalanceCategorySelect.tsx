'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, MenuItem, TextField } from '@mui/material';
import {
  ACCOUNT_BALANCE_CATEGORY_OPTIONS,
  getAccountBalanceCategoryLabel,
  type AccountBalanceCategory,
} from '@/lib/accountBalanceCategories';

interface AccountBalanceCategorySelectProps {
  accountId: string;
  value: AccountBalanceCategory | null;
  inferredValue: AccountBalanceCategory | null;
}

export default function AccountBalanceCategorySelect({
  accountId,
  value,
  inferredValue,
}: AccountBalanceCategorySelectProps) {
  const router = useRouter();
  const [draftValue, setDraftValue] = useState<AccountBalanceCategory | 'auto'>(value ?? 'auto');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveBalanceCategory(nextValue: AccountBalanceCategory | 'auto') {
    setDraftValue(nextValue);
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance_category: nextValue === 'auto' ? null : nextValue }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? 'Unable to update balance category.');
        setDraftValue(value ?? 'auto');
        return;
      }
      router.refresh();
    } catch {
      setError('Unable to reach the server. Try choosing the balance category again.');
      setDraftValue(value ?? 'auto');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <TextField
        select
        size="small"
        label="Balance category"
        helperText={isSaving ? 'Saving…' : 'Saves automatically'}
        value={draftValue}
        onChange={(event) => void saveBalanceCategory(event.target.value as AccountBalanceCategory | 'auto')}
        disabled={isSaving}
        sx={{ minWidth: 150 }}
      >
        <MenuItem value="auto">Auto{inferredValue ? ` (${getAccountBalanceCategoryLabel(inferredValue)})` : ''}</MenuItem>
        <MenuItem value="hidden">Not shown</MenuItem>
        {ACCOUNT_BALANCE_CATEGORY_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      {error ? <Alert severity="error">{error}</Alert> : null}
    </>
  );
}
