'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { formatCurrency, parseCurrencyToCents } from '@/lib/money';
import { applyTransactionDirection, type TransactionDirection } from '@/lib/transactionLedger';
import type { Account, Category, Transaction } from '@/types/database';

export type ManualTransactionAccountOption = Pick<Account, 'id' | 'name' | 'type' | 'source'>;

interface ManualTransactionDialogProps {
  accounts: ManualTransactionAccountOption[];
  categories: Pick<Category, 'id' | 'name' | 'is_income'>[];
  transaction?: Transaction;
  compact?: boolean;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ManualTransactionDialog({
  accounts,
  categories,
  transaction,
  compact = false,
}: ManualTransactionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(transaction?.account_id ?? accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? '');
  const [date, setDate] = useState(transaction?.date ?? today());
  const [direction, setDirection] = useState<TransactionDirection>(transaction?.amount_cents && transaction.amount_cents < 0 ? 'income' : 'expense');
  const [amount, setAmount] = useState(
    transaction ? formatCurrency(Math.abs(transaction.amount_cents)).replace('$', '') : ''
  );
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [notes, setNotes] = useState(transaction?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAccountId(transaction?.account_id ?? accounts[0]?.id ?? '');
    setCategoryId(transaction?.category_id ?? '');
    setDate(transaction?.date ?? today());
    setDirection(transaction?.amount_cents && transaction.amount_cents < 0 ? 'income' : 'expense');
    setAmount(transaction ? formatCurrency(Math.abs(transaction.amount_cents)).replace('$', '') : '');
    setDescription(transaction?.description ?? '');
    setNotes(transaction?.notes ?? '');
    setError(null);
  }, [accounts, open, transaction]);

  async function save() {
    let parsedAmount: number;
    try {
      parsedAmount = parseCurrencyToCents(amount);
    } catch {
      setError('Enter a valid amount.');
      return;
    }

    const amountCents = applyTransactionDirection(parsedAmount, direction);
    if (!amountCents) {
      setError('Enter a non-zero amount.');
      return;
    }

    setSaving(true);
    setError(null);
    const response = await fetch(
      transaction ? `/api/manual-transactions/${transaction.id}` : '/api/transactions',
      {
        method: transaction ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId,
          category_id: categoryId || null,
          date,
          amount_cents: amountCents,
          description,
          notes,
        }),
      }
    );
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setSaving(false);

    if (!response.ok) {
      setError(data.error ?? 'Unable to save transaction.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!transaction || !window.confirm('Delete this manual transaction? This cannot be undone.')) return;
    setDeleting(true);
    setError(null);
    const response = await fetch(`/api/manual-transactions/${transaction.id}`, { method: 'DELETE' });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setDeleting(false);

    if (!response.ok) {
      setError(data.error ?? 'Unable to delete transaction.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  const busy = saving || deleting;
  return (
    <>
      <Button
        size={compact ? 'small' : 'medium'}
        variant={transaction ? 'text' : 'contained'}
        startIcon={transaction ? <EditIcon /> : <AddIcon />}
        onClick={() => setOpen(true)}
      >
        {transaction ? 'Edit' : 'Add transaction'}
      </Button>
      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{transaction ? 'Edit manual transaction' : 'Add a manual transaction'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField select label="Account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name}{account.source === 'manual' ? ' · Manual' : ''}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                label="Type"
                value={direction}
                onChange={(event) => setDirection(event.target.value as TransactionDirection)}
                sx={{ minWidth: 140 }}
              >
                <MenuItem value="expense">Expense</MenuItem>
                <MenuItem value="income">Income</MenuItem>
              </TextField>
              <TextField label="Amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputProps={{ inputMode: 'decimal' }} />
              <TextField label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} InputLabelProps={{ shrink: true }} />
            </Stack>
            <TextField label="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
            <TextField select label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <MenuItem value="">Uncategorized</MenuItem>
              {categories.map((category) => (
                <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
              ))}
            </TextField>
            <TextField label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={2} />
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: transaction ? 'space-between' : 'flex-end' }}>
          {transaction ? (
            <Button color="error" startIcon={<DeleteIcon />} onClick={() => void remove()} disabled={busy}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          ) : null}
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="contained" onClick={() => void save()} disabled={busy || accounts.length === 0}>
              {saving ? 'Saving…' : 'Save transaction'}
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>
    </>
  );
}
