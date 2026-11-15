'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, ButtonGroup, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, Snackbar, Stack, TextField, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
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
  note?: string | null;
}
interface SyncResult { imported_count?: number; skipped_count?: number; items?: SyncItemDetail[]; error?: string; message?: string }
type SyncMode = 'latest' | 'last_30_days' | 'custom';
interface SyncTransactionsButtonProps {
  accountIds?: string[];
  itemIds?: string[];
  label?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'text' | 'outlined' | 'contained';
  disabled?: boolean;
}

export default function SyncTransactionsButton({ accountIds, itemIds, label = 'Sync transactions', size = 'medium', variant = 'contained', disabled = false }: SyncTransactionsButtonProps) {
  const router = useRouter();
  const syncingRef = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const noTargets = accountIds?.length === 0 || itemIds?.length === 0;
  const isDisabled = disabled || noTargets || isSyncing;

  async function handleSync(mode: SyncMode = 'latest', startDate?: string) {
    if (disabled || noTargets || syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    setNotificationOpen(false);
    setResult(null);
    setError(null);
    try {
      const response = await fetch('/api/plaid/sync-transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, ...(accountIds ? { account_ids: accountIds } : {}), ...(itemIds ? { item_ids: itemIds } : {}), ...(startDate ? { start_date: startDate } : {}) }),
      });
      const data = (await response.json()) as SyncResult;
      if (!response.ok) {
        setError(data.error ?? 'Unable to sync transactions. Try again.');
      } else {
        setResult(data);
        router.refresh();
      }
    } catch {
      setError('Unable to reach the server. Please try syncing again.');
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      setNotificationOpen(true);
    }
  }
  const summary = error ?? result?.message ?? `${result?.imported_count ?? 0} transactions updated`;
  return <>
    <ButtonGroup variant={variant} size={size} disabled={isDisabled} aria-label={label}
      sx={{ flexShrink: 0, maxWidth: '100%', '& .MuiButton-root': { minHeight: 40 }, '& .MuiButton-startIcon': { flexShrink: 0 } }}>
      <Button onClick={() => void handleSync()} startIcon={isSyncing ? <CircularProgress color="inherit" size={18} /> : <SyncIcon />}
        sx={{ px: size === 'small' ? 1.25 : 2, whiteSpace: 'nowrap' }}>
        {isSyncing ? 'Syncing…' : label}
      </Button>
      <Button aria-label="Sync options" aria-haspopup="menu" aria-expanded={Boolean(menuAnchorEl)} disabled={isDisabled}
        onClick={(event) => setMenuAnchorEl(event.currentTarget)} sx={{ px: 0.5, minWidth: '36px !important' }}>
        <ArrowDropDownIcon fontSize="small" />
      </Button>
    </ButtonGroup>
    <Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={() => setMenuAnchorEl(null)}>
      <MenuItem onClick={() => { setMenuAnchorEl(null); void handleSync('latest'); }}>Sync since last sync</MenuItem>
      <MenuItem onClick={() => { setMenuAnchorEl(null); void handleSync('last_30_days'); }}>Re-sync last 30 days</MenuItem>
      <MenuItem onClick={() => { setMenuAnchorEl(null); setDateError(null); setCustomDialogOpen(true); }}>Sync from custom date</MenuItem>
    </Menu>
    <Dialog open={customDialogOpen} onClose={() => setCustomDialogOpen(false)} fullWidth maxWidth="xs" aria-labelledby="custom-sync-title">
      <DialogTitle id="custom-sync-title">Sync from date</DialogTitle>
      <DialogContent>
        <TextField label="Start date" type="date" value={customStartDate} onChange={(event) => { setCustomStartDate(event.target.value); setDateError(null); }}
          InputLabelProps={{ shrink: true }} inputProps={{ max: new Date().toISOString().slice(0, 10) }} error={Boolean(dateError)}
          helperText={dateError ?? 'Fetch transactions from this date through today.'} fullWidth sx={{ mt: 1 }} />
      </DialogContent>
      <DialogActions><Button onClick={() => setCustomDialogOpen(false)}>Cancel</Button><Button variant="contained" onClick={() => {
        if (!customStartDate || customStartDate > new Date().toISOString().slice(0, 10)) { setDateError('Choose a start date on or before today.'); return; }
        setCustomDialogOpen(false); void handleSync('custom', customStartDate);
      }}>Sync</Button></DialogActions>
    </Dialog>
    <Snackbar open={notificationOpen} autoHideDuration={error ? null : 7000} onClose={(_event, reason) => { if (reason !== 'clickaway') setNotificationOpen(false); }}
      message={<Stack direction="row" alignItems="center" spacing={1} role="status">{!error ? <CheckIcon fontSize="small" /> : null}<span>{summary}</span></Stack>}
      action={<>
        <Button color="inherit" size="small" onClick={() => { setNotificationOpen(false); setDetailsOpen(true); }}>{error ? 'View error' : 'Details'}</Button>
        <IconButton size="small" color="inherit" aria-label="Dismiss sync result" onClick={() => setNotificationOpen(false)}><CloseIcon fontSize="small" /></IconButton>
      </>} />
    <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} fullWidth maxWidth="sm" aria-labelledby="sync-result-title">
      <DialogTitle id="sync-result-title">{error ? 'Sync could not finish' : 'Transaction sync complete'}</DialogTitle>
      <DialogContent dividers>
        {error ? <Alert severity="error">{error}</Alert> : <Stack spacing={2}>
          <Typography>{summary}</Typography>
          {(result?.items ?? []).map((item, index) => <Box key={index} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
            <Typography fontWeight={600}>{item.institution_name ?? 'Connected institution'}</Typography>
            <Typography variant="body2" color="text.secondary">{item.start_date} – {item.end_date}</Typography>
            <Typography variant="body2" sx={{ mt: 0.75 }}>{item.imported_count} updated · {item.skipped_count} excluded from this sync</Typography>
            {item.note ? <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{item.note}</Typography> : null}
          </Box>)}
          <Typography variant="body2" color="text.secondary">Updated totals include existing transactions checked again for changes. Transactions outside the selected accounts are excluded.</Typography>
        </Stack>}
      </DialogContent>
      <DialogActions><Button onClick={() => setDetailsOpen(false)}>Close</Button></DialogActions>
    </Dialog>
  </>;
}
