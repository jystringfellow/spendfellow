'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import { formatCurrency } from '@/lib/money';

export interface CreditCardPaymentLinkSummary {
  id: string;
  counterpart: {
    id: string;
    date: string;
    amount_cents: number;
    description: string;
    merchant_name: string | null;
    account_name: string;
  };
}

type Candidate = CreditCardPaymentLinkSummary['counterpart'];

interface CreditCardPaymentLinkButtonProps {
  transactionId: string;
  link: CreditCardPaymentLinkSummary | null;
  marked: boolean;
  eligible: boolean;
  onLinked?: (counterpartTransactionId: string) => void;
  onMarked?: () => void;
}

export default function CreditCardPaymentLinkButton({
  transactionId,
  link,
  marked,
  eligible,
  onLinked,
  onMarked,
}: CreditCardPaymentLinkButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!eligible && !link && !marked) return null;

  async function show() {
    setOpen(true);
    setError(null);
    if (link) return;

    setLoading(true);
    const response = await fetch(`/api/credit-card-payment-links?transactionId=${encodeURIComponent(transactionId)}`);
    const data = (await response.json().catch(() => ({}))) as { error?: string; candidates?: Candidate[] };
    setLoading(false);
    if (!response.ok) {
      setError(data.error ?? 'Unable to find matching payments.');
      return;
    }
    setCandidates(data.candidates ?? []);
    setSelectedId(data.candidates?.[0]?.id ?? '');
  }

  async function createLink() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    const response = await fetch('/api/credit-card-payment-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: transactionId, counterpart_transaction_id: selectedId }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? 'Unable to link payments.');
      return;
    }
    setOpen(false);
    onLinked?.(selectedId);
    router.refresh();
  }

  async function markPayment() {
    setSaving(true);
    setError(null);
    const response = await fetch('/api/transaction-budget-exclusions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: transactionId, reason: 'credit_card_payment' }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? 'Unable to mark this payment.');
      return;
    }
    setOpen(false);
    onMarked?.();
    router.refresh();
  }

  async function removeMark() {
    setSaving(true);
    setError(null);
    const response = await fetch(
      `/api/transaction-budget-exclusions/${encodeURIComponent(transactionId)}`,
      { method: 'DELETE' }
    );
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? 'Unable to include this payment in the budget.');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function removeLink() {
    if (!link) return;
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/credit-card-payment-links/${link.id}`, { method: 'DELETE' });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? 'Unable to unlink payments.');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        size="small"
        variant="text"
        startIcon={link ? <LinkIcon /> : <CreditCardIcon />}
        onClick={() => void show()}
      >
        {link ? 'Linked' : 'CC payment'}
      </Button>
      <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{link ? 'Linked credit-card payment' : 'Credit-card payment'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {link ? (
              <Stack spacing={0.5}>
                <Typography fontWeight={600}>{link.counterpart.account_name}</Typography>
                <Typography>{link.counterpart.merchant_name ?? link.counterpart.description}</Typography>
                <Typography color="text.secondary">
                  {link.counterpart.date} · {formatCurrency(link.counterpart.amount_cents)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Both sides remain in Transactions and are excluded from budget actuals.
                </Typography>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                {marked ? (
                  <Alert severity="success">
                    This transaction is marked as a CC payment and excluded from budget actuals. You can still link it if the counterpart appears later.
                  </Alert>
                ) : null}
                {loading ? (
                  <Typography color="text.secondary">Looking for equal-and-opposite payments…</Typography>
                ) : candidates.length > 0 ? (
                  <RadioGroup value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                    {candidates.map((candidate) => (
                      <FormControlLabel
                        key={candidate.id}
                        value={candidate.id}
                        control={<Radio />}
                        label={
                          <Stack spacing={0.25} sx={{ py: 0.75 }}>
                            <Typography fontWeight={600}>{candidate.account_name}</Typography>
                            <Typography variant="body2">{candidate.merchant_name ?? candidate.description}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {candidate.date} · {formatCurrency(candidate.amount_cents)}
                            </Typography>
                          </Stack>
                        }
                      />
                    ))}
                  </RadioGroup>
                ) : (
                  <Typography color="text.secondary">
                    No unlinked, equal-and-opposite checking/credit transaction was found within 14 days.
                  </Typography>
                )}
                {!marked ? (
                  <Typography variant="body2" color="text.secondary">
                    If the card is not linked or its matching transaction is unavailable, mark only this side to keep the cash transfer out of the budget.
                  </Typography>
                ) : null}
              </Stack>
            )}
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Close</Button>
          {link ? (
            <Button color="error" startIcon={<LinkOffIcon />} onClick={() => void removeLink()} disabled={saving}>
              {saving ? 'Unlinking…' : 'Unlink'}
            </Button>
          ) : null}
          {!link && marked ? (
            <Button color="error" onClick={() => void removeMark()} disabled={saving}>
              {saving ? 'Updating…' : 'Include in budget'}
            </Button>
          ) : null}
          {!link && !marked ? (
            <Button variant="outlined" onClick={() => void markPayment()} disabled={saving}>
              {saving ? 'Marking…' : 'Mark only this transaction'}
            </Button>
          ) : null}
          {!link && candidates.length > 0 ? (
            <Button variant="contained" onClick={() => void createLink()} disabled={saving || !selectedId}>
              {saving ? 'Linking…' : 'Link transactions'}
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>
    </>
  );
}
