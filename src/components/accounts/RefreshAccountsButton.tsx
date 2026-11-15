'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, CircularProgress, Snackbar } from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';

interface RefreshAccountsButtonProps {
  accountIds?: string[];
  label?: string;
  refreshedLabel?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'text' | 'outlined' | 'contained';
}
export default function RefreshAccountsButton({ accountIds, label = 'Refresh balances', refreshedLabel, size = 'medium', variant = 'outlined' }: RefreshAccountsButtonProps) {
  const router = useRouter();
  const busy = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function handleRefresh() {
    if (busy.current || accountIds?.length === 0) return;
    busy.current = true;
    setIsRefreshing(true);
    setMessage(null);
    try {
      const response = await fetch('/api/plaid/refresh-accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountIds ? { account_ids: accountIds } : {}),
      });
      const data = (await response.json()) as { accounts_count?: number; skipped_count?: number; error?: string };
      if (!response.ok) { setMessage(data.error ?? 'Unable to refresh balances. Try again.'); return; }
      setMessage(refreshedLabel ?? ((data.accounts_count ?? 0) > 0 ? `Refreshed ${data.accounts_count} accounts` : (data.skipped_count ?? 0) > 0 ? 'Balances already refreshed today' : 'No balances refreshed'));
      router.refresh();
    } catch { setMessage('Unable to reach the server. Please try refreshing again.'); }
    finally { busy.current = false; setIsRefreshing(false); }
  }
  return <>
    <Button variant={variant} size={size} disabled={isRefreshing || accountIds?.length === 0} onClick={() => void handleRefresh()}
      startIcon={isRefreshing ? <CircularProgress color="inherit" size={18} /> : <AccountBalanceIcon />}
      sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
      {isRefreshing ? 'Refreshing…' : label}
    </Button>
    <Snackbar open={Boolean(message)} message={<span role="status">{message}</span>} autoHideDuration={7000}
      onClose={(_event, reason) => { if (reason !== 'clickaway') setMessage(null); }}
      action={<Button size="small" color="inherit" onClick={() => setMessage(null)}>Dismiss</Button>} />
  </>;
}
