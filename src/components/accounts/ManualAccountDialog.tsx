'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { parseCurrencyToCents } from '@/lib/money';

export default function ManualAccountDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('Cash Wallet');
  const [startingBalance, setStartingBalance] = useState('0.00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    let startingBalanceCents: number;
    try {
      startingBalanceCents = parseCurrencyToCents(startingBalance || '0');
    } catch {
      setError('Enter a valid starting balance.');
      return;
    }

    setSaving(true);
    setError(null);
    const response = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, starting_balance_cents: startingBalanceCents }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setSaving(false);

    if (!response.ok) {
      setError(data.error ?? 'Unable to create manual account.');
      return;
    }

    setOpen(false);
    setName('Cash Wallet');
    setStartingBalance('0.00');
    router.refresh();
  }

  return (
    <>
      <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
        Manual account
      </Button>
      <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add a manual account</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Account name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            <TextField
              label="Starting balance"
              value={startingBalance}
              onChange={(event) => setStartingBalance(event.target.value)}
              helperText="For example, the cash currently in your wallet."
              inputProps={{ inputMode: 'decimal' }}
            />
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={() => void save()} disabled={saving}>
            {saving ? 'Creating…' : 'Create account'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
