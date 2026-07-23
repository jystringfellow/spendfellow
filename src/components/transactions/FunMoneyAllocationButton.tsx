'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { formatCurrency, parseCurrencyToCents } from '@/lib/money';
import type { Category, CategoryBalanceAdjustment } from '@/types/database';

export type FunMoneyAllocationSummary = Pick<
  CategoryBalanceAdjustment,
  'id' | 'category_id' | 'amount_cents' | 'effective_date' | 'description'
>;

interface FunMoneyAllocationButtonProps {
  transactionId: string;
  transactionDate: string;
  transactionAmountCents: number;
  transactionDescription: string;
  categories: Pick<
    Category,
    'id' | 'name' | 'rollover_enabled' | 'rollover_start_date'
  >[];
  allocations: FunMoneyAllocationSummary[];
  eligible: boolean;
}

function amountInput(cents: number | undefined): string {
  return cents ? (cents / 100).toFixed(2) : '';
}

export default function FunMoneyAllocationButton({
  transactionId,
  transactionDate,
  transactionAmountCents,
  transactionDescription,
  categories,
  allocations,
  eligible,
}: FunMoneyAllocationButtonProps) {
  const router = useRouter();
  const rolloverCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.rollover_enabled &&
          category.rollover_start_date &&
          category.rollover_start_date <= transactionDate
      ),
    [categories, transactionDate]
  );
  const [open, setOpen] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [description, setDescription] = useState(`Income allocation: ${transactionDescription}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const amountByCategoryId = new Map(
      allocations.map((allocation) => [allocation.category_id, allocation.amount_cents])
    );
    setAmounts(
      Object.fromEntries(
        rolloverCategories.map((category) => [
          category.id,
          amountInput(amountByCategoryId.get(category.id)),
        ])
      )
    );
    setDescription(allocations[0]?.description ?? `Income allocation: ${transactionDescription}`);
    setError(null);
  }, [allocations, open, rolloverCategories, transactionDescription]);

  if (!eligible || rolloverCategories.length === 0) {
    return null;
  }

  const allocatedCents = Object.values(amounts).reduce((total, value) => {
    if (!value.trim()) {
      return total;
    }
    try {
      return total + Math.abs(parseCurrencyToCents(value));
    } catch {
      return total;
    }
  }, 0);
  const incomeCents = Math.abs(transactionAmountCents);

  async function save() {
    const parsedAllocations: Array<{ category_id: string; amount_cents: number }> = [];
    try {
      rolloverCategories.forEach((category) => {
        const value = amounts[category.id]?.trim();
        if (!value) {
          return;
        }
        const amountCents = parseCurrencyToCents(value);
        if (amountCents <= 0) {
          throw new Error('Allocation amounts must be positive.');
        }
        parsedAllocations.push({ category_id: category.id, amount_cents: amountCents });
      });
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Enter valid allocation amounts.');
      return;
    }

    if (parsedAllocations.reduce((total, allocation) => total + allocation.amount_cents, 0) > incomeCents) {
      setError('Allocations cannot exceed the income transaction.');
      return;
    }

    setSaving(true);
    setError(null);
    const response = await fetch('/api/fun-money-adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_transaction_id: transactionId,
        effective_date: transactionDate,
        description,
        allocations: parsedAllocations,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setSaving(false);

    if (!response.ok) {
      setError(data.error ?? 'Unable to save fun-money allocations.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        size="small"
        variant={allocations.length > 0 ? 'contained' : 'outlined'}
        color={allocations.length > 0 ? 'success' : 'primary'}
        startIcon={<AccountBalanceWalletIcon />}
        onClick={() => setOpen(true)}
      >
        {allocations.length > 0 ? formatCurrency(allocations.reduce((sum, row) => sum + row.amount_cents, 0)) : 'Fun money'}
      </Button>
      <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Allocate income to fun money</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              This transaction remains {formatCurrency(incomeCents)} of earned income. These allocations only
              increase rollover balances.
            </Typography>
            {rolloverCategories.map((category) => (
              <TextField
                key={category.id}
                label={category.name}
                value={amounts[category.id] ?? ''}
                onChange={(event) =>
                  setAmounts((current) => ({ ...current, [category.id]: event.target.value }))
                }
                placeholder="0.00"
                inputProps={{ inputMode: 'decimal' }}
              />
            ))}
            <TextField
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
            />
            <Typography
              variant="body2"
              color={allocatedCents > incomeCents ? 'error.main' : 'text.secondary'}
            >
              Allocated {formatCurrency(allocatedCents)} of {formatCurrency(incomeCents)}
            </Typography>
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void save()} disabled={saving || !description.trim()}>
            {saving ? 'Saving…' : allocations.length > 0 ? 'Update allocations' : 'Save allocations'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
