'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, CircularProgress, Stack } from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CheckIcon from '@mui/icons-material/Check';

interface RefreshAccountsButtonProps {
  accountIds?: string[];
  label?: string;
  refreshedLabel?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'text' | 'outlined' | 'contained';
}

export default function RefreshAccountsButton({
  accountIds,
  label = 'Refresh balances',
  refreshedLabel,
  size = 'medium',
  variant = 'outlined',
}: RefreshAccountsButtonProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleRefresh() {
    if (isRefreshing || message) {
      return;
    }

    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }

    setIsRefreshing(true);
    setMessage(null);
    setError(null);

    const response = await fetch('/api/plaid/refresh-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(accountIds?.length ? { account_ids: accountIds } : {}),
      }),
    });
    const data = (await response.json()) as { accounts_count?: number; skipped_count?: number; error?: string };

    setIsRefreshing(false);

    if (!response.ok) {
      setError(data.error ?? 'Unable to refresh account balances.');
      return;
    }

    const refreshedCount = data.accounts_count ?? 0;
    const skippedCount = data.skipped_count ?? 0;
    setMessage(
      refreshedLabel ??
        (refreshedCount > 0
          ? `Refreshed ${refreshedCount} accounts`
          : skippedCount > 0
            ? 'Already refreshed today'
            : 'No balances refreshed')
    );
    successTimerRef.current = setTimeout(() => {
      setMessage(null);
      successTimerRef.current = null;
    }, 3_000);
    router.refresh();
  }

  return (
    <Stack spacing={1.5} alignItems="flex-start">
      <Button
        variant={variant}
        size={size}
        color={message ? 'success' : 'primary'}
        startIcon={
          isRefreshing ? <CircularProgress color="inherit" size={18} /> : message ? <CheckIcon /> : <AccountBalanceIcon />
        }
        disabled={isRefreshing}
        aria-disabled={Boolean(message)}
        onClick={handleRefresh}
        sx={{
          minWidth: size === 'small' ? 116 : 178,
          ...(message
            ? {
                pointerEvents: 'none',
              }
            : {}),
        }}
      >
        {isRefreshing ? 'Refreshing...' : message ?? label}
      </Button>
      {error ? <Alert severity="error">{error}</Alert> : null}
    </Stack>
  );
}
