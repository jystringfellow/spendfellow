'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddCardIcon from '@mui/icons-material/AddCard';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { formatCurrency, parseCurrencyToCents } from '@/lib/money';
import type {
  Category,
  CategoryBalanceAdjustment,
  CategoryBalanceAdjustmentKind,
} from '@/types/database';

interface FunMoneyAdjustmentDialogProps {
  categories: Pick<Category, 'id' | 'name' | 'rollover_enabled'>[];
  adjustments: CategoryBalanceAdjustment[];
  monthStart: string;
  monthEnd: string;
}

const KIND_OPTIONS: Array<{ value: CategoryBalanceAdjustmentKind; label: string }> = [
  { value: 'gift', label: 'Gift or gift card' },
  { value: 'opening_balance', label: 'Opening balance' },
  { value: 'correction', label: 'Correction' },
  { value: 'other', label: 'Other non-cash credit' },
];

function getKindLabel(kind: CategoryBalanceAdjustmentKind): string {
  if (kind === 'income_allocation') {
    return 'Income allocation';
  }
  return KIND_OPTIONS.find((option) => option.value === kind)?.label ?? 'Adjustment';
}

export default function FunMoneyAdjustmentDialog({
  categories,
  adjustments,
  monthStart,
  monthEnd,
}: FunMoneyAdjustmentDialogProps) {
  const router = useRouter();
  const rolloverCategories = useMemo(
    () => categories.filter((category) => category.rollover_enabled),
    [categories]
  );
  const categoryById = useMemo(
    () => new Map(rolloverCategories.map((category) => [category.id, category])),
    [rolloverCategories]
  );
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(rolloverCategories[0]?.id ?? '');
  const [date, setDate] = useState(monthStart);
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<CategoryBalanceAdjustmentKind>('gift');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setCategoryId(rolloverCategories[0]?.id ?? '');
    setDate(monthStart);
    setAmount('');
    setKind('gift');
    setDescription('');
    setError(null);
  }, [monthStart, open, rolloverCategories]);

  if (rolloverCategories.length === 0) {
    return null;
  }

  async function save() {
    let amountCents: number;
    try {
      amountCents = parseCurrencyToCents(amount);
    } catch {
      setError('Enter a valid amount.');
      return;
    }

    if (!amountCents || (kind !== 'correction' && amountCents < 0)) {
      setError(kind === 'correction' ? 'Enter a non-zero amount.' : 'Enter a positive credit amount.');
      return;
    }

    setSaving(true);
    setError(null);
    const response = await fetch('/api/fun-money-adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        effective_date: date,
        kind,
        description,
        allocations: [{ category_id: categoryId, amount_cents: amountCents }],
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setSaving(false);

    if (!response.ok) {
      setError(data.error ?? 'Unable to add the fun-money credit.');
      return;
    }

    setAmount('');
    setDescription('');
    router.refresh();
  }

  async function remove(adjustmentId: string) {
    setDeletingId(adjustmentId);
    setError(null);
    const response = await fetch(`/api/fun-money-adjustments/${adjustmentId}`, {
      method: 'DELETE',
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setDeletingId(null);

    if (!response.ok) {
      setError(data.error ?? 'Unable to remove the adjustment.');
      return;
    }

    router.refresh();
  }

  return (
    <>
      <Button size="small" variant="contained" startIcon={<AddCardIcon />} onClick={() => setOpen(true)}>
        Fun money
      </Button>
      <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Fun-money credits</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Stack spacing={2}>
              <Typography variant="subtitle2">Add an off-ledger credit</Typography>
              <Typography variant="body2" color="text.secondary">
                For earned income, allocate directly from its transaction. Use this form for gift cards, opening
                balances, and corrections that do not have an income transaction.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  select
                  label="Category"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  sx={{ minWidth: 180 }}
                >
                  {rolloverCategories.map((category) => (
                    <MenuItem key={category.id} value={category.id}>
                      {category.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Type"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as CategoryBalanceAdjustmentKind)}
                  sx={{ minWidth: 190 }}
                >
                  {KIND_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputProps={{ inputMode: 'decimal' }}
                />
                <TextField
                  label="Date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: monthStart, max: monthEnd }}
                />
              </Stack>
              <TextField
                label="Description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What increased this balance?"
              />
              <Button
                variant="contained"
                onClick={() => void save()}
                disabled={saving || !categoryId || !description.trim()}
                sx={{ alignSelf: 'flex-start' }}
              >
                {saving ? 'Adding…' : 'Add credit'}
              </Button>
            </Stack>

            <Stack spacing={1}>
              <Typography variant="subtitle2">This month’s adjustments</Typography>
              {adjustments.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No fun-money credits in this month.
                </Typography>
              ) : (
                adjustments.map((adjustment) => (
                  <Stack
                    key={adjustment.id}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1 }}
                  >
                    <Typography sx={{ minWidth: 110 }}>{adjustment.effective_date}</Typography>
                    <Typography fontWeight={600} sx={{ minWidth: 110 }}>
                      {categoryById.get(adjustment.category_id)?.name ?? 'Unknown'}
                    </Typography>
                    <Typography sx={{ flex: 1 }}>{adjustment.description}</Typography>
                    <Chip size="small" label={getKindLabel(adjustment.kind)} />
                    <Typography
                      fontWeight={700}
                      color={adjustment.amount_cents >= 0 ? 'success.main' : 'error.main'}
                    >
                      {formatCurrency(adjustment.amount_cents)}
                    </Typography>
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`Delete ${adjustment.description}`}
                      disabled={deletingId === adjustment.id}
                      onClick={() => void remove(adjustment.id)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))
              )}
            </Stack>
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
