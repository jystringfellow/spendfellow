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
  eligible: boolean;
  onLinked?: (counterpartTransactionId: string) => void;
}

export default function CreditCardPaymentLinkButton({
  transactionId,
  link,
  eligible,
  onLinked,
}: CreditCardPaymentLinkButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!eligible && !link) return null;

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
        startIcon={link ? <LinkIcon /> : undefined}
        onClick={() => void show()}
      >
        {link ? 'Linked' : 'Link payment'}
      </Button>
      <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{link ? 'Linked credit-card payment' : 'Link credit-card payment'}</DialogTitle>
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
            ) : loading ? (
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
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Close</Button>
          {link ? (
            <Button color="error" startIcon={<LinkOffIcon />} onClick={() => void removeLink()} disabled={saving}>
              {saving ? 'Unlinking…' : 'Unlink'}
            </Button>
          ) : (
            <Button variant="contained" onClick={() => void createLink()} disabled={saving || !selectedId}>
              {saving ? 'Linking…' : 'Link transactions'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
