'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  ButtonGroup,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SyncIcon from '@mui/icons-material/Sync';

interface SyncItemDetail {
  institution_name: string | null;
  environment: string | null;
  start_date: string;
  end_date: string;
  plaid_transaction_count: number;
  imported_count: number;
  skipped_count: number;
  spending_account_count?: number;
  balance_only_account_count?: number;
  note?: string | null;
}

type SyncMode = 'latest' | 'last_30_days' | 'custom';

interface SyncTransactionsButtonProps {
  accountIds?: string[];
  itemIds?: string[];
  label?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'text' | 'outlined' | 'contained';
}

export default function SyncTransactionsButton({
  accountIds,
  itemIds,
  label = 'Sync transactions',
  size = 'medium',
  variant = 'contained',
}: SyncTransactionsButtonProps) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleSync(mode: SyncMode = 'latest', startDate?: string) {
    if (isSyncing || message) {
      return;
    }

    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }

    setIsSyncing(true);
    setMessage(null);
    setDetails(null);
    setError(null);

    const response = await fetch('/api/plaid/sync-transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        ...(accountIds?.length ? { account_ids: accountIds } : {}),
        ...(itemIds?.length ? { item_ids: itemIds } : {}),
        ...(startDate ? { start_date: startDate } : {}),
      }),
    });
    const data = (await response.json()) as {
      imported_count?: number;
      skipped_count?: number;
      items?: SyncItemDetail[];
      error?: string;
    };

    setIsSyncing(false);

    if (!response.ok) {
      setError(data.error ?? 'Unable to sync transactions.');
      return;
    }

    setMessage(`Synced ${data.imported_count ?? 0} transactions`);
    if ((data.imported_count ?? 0) === 0 || (data.skipped_count ?? 0) > 0) {
      const itemSummary = (data.items ?? [])
        .map((item) => {
          const name = item.institution_name ?? 'Plaid item';
          const base = `${name} (${item.environment ?? 'unknown'}): Plaid returned ${item.plaid_transaction_count}, imported ${item.imported_count}, skipped ${item.skipped_count} for ${item.start_date} to ${item.end_date}`;
          return item.note ? `${base}. ${item.note}` : base;
        })
        .join('; ');
      setDetails(itemSummary || `Imported ${data.imported_count ?? 0}; skipped ${data.skipped_count ?? 0}.`);
    }
    successTimerRef.current = setTimeout(() => {
      setMessage(null);
      setDetails(null);
      successTimerRef.current = null;
    }, 3_000);
    router.refresh();
  }

  function handleCustomSync() {
    if (!customStartDate) {
      setError('Choose a start date before syncing a custom range.');
      return;
    }

    setCustomDialogOpen(false);
    void handleSync('custom', customStartDate);
  }

  const isSuccess = Boolean(message);
  const isInteractionDisabled = isSyncing || isSuccess;

  return (
    <Stack spacing={1.5} alignItems="flex-start">
      <ButtonGroup variant={variant} size={size} color={isSuccess ? 'success' : 'primary'} disabled={isSyncing}>
        <Button
          startIcon={isSyncing ? <CircularProgress color="inherit" size={18} /> : message ? <CheckIcon /> : <SyncIcon />}
          aria-disabled={isSuccess}
          onClick={() => void handleSync('latest')}
          sx={{
            minWidth: size === 'small' ? 100 : 190,
            ...(isSuccess
              ? {
                  pointerEvents: 'none',
                }
              : {}),
          }}
        >
          {isSyncing ? 'Syncing...' : message ?? label}
        </Button>
        <IconButton
          color="inherit"
          disabled={isInteractionDisabled}
          aria-label="Sync options"
          onClick={(event) => setMenuAnchorEl(event.currentTarget)}
          sx={{ borderRadius: 0, width: 44 }}
        >
          <ArrowDropDownIcon />
        </IconButton>
      </ButtonGroup>
      <Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={() => setMenuAnchorEl(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchorEl(null);
            void handleSync('latest');
          }}
        >
          Sync since last sync
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchorEl(null);
            void handleSync('last_30_days');
          }}
        >
          Re-sync last 30 days
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchorEl(null);
            setCustomDialogOpen(true);
          }}
        >
          Sync from custom date
        </MenuItem>
      </Menu>
      <Dialog open={customDialogOpen} onClose={() => setCustomDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Sync From Date</DialogTitle>
        <DialogContent>
          <TextField
            label="Start date"
            type="date"
            value={customStartDate}
            onChange={(event) => setCustomStartDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
            helperText="Transactions from this date through today will be fetched."
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCustomDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCustomSync}>
            Sync
          </Button>
        </DialogActions>
      </Dialog>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {details ? <Alert severity="info">{details}</Alert> : null}
    </Stack>
  );
}
