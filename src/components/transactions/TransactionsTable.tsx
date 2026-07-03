'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Chip,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import CheckIcon from '@mui/icons-material/Check';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import { formatCurrency } from '@/lib/money';
import TagAutocomplete from './TagAutocomplete';
import type { Category, Tag, Transaction } from '@/types/database';

export interface EditableTransactionRow extends Transaction {
  accounts: {
    name: string;
  } | null;
  transaction_tag_ids: string[];
  transaction_split_count: number;
}

interface TransactionsTableProps {
  transactions: EditableTransactionRow[];
  categories: Pick<Category, 'id' | 'name'>[];
  tags: Pick<Tag, 'id' | 'name' | 'color'>[];
}

interface RowDraft {
  categoryId: string;
  notes: string;
  tagIds: string[];
  tagNames: string[];
  isSaving: boolean;
  error: string | null;
  saved: boolean;
}

function createDraft(transaction: EditableTransactionRow): RowDraft {
  return {
    categoryId: transaction.category_id ?? '',
    notes: transaction.notes ?? '',
    tagIds: transaction.transaction_tag_ids,
    tagNames: [],
    isSaving: false,
    error: null,
    saved: false,
  };
}

export default function TransactionsTable({ transactions, categories, tags }: TransactionsTableProps) {
  const router = useRouter();
  const [tagOptions, setTagOptions] = useState(tags);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(transactions.map((transaction) => [transaction.id, createDraft(transaction)]))
  );
  const savedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    setTagOptions(tags);
  }, [tags]);

  useEffect(() => {
    setDrafts((currentDrafts) =>
      Object.fromEntries(
        transactions.map((transaction) => {
          const currentDraft = currentDrafts[transaction.id];
          if (currentDraft?.isSaving || currentDraft?.saved) {
            return [transaction.id, currentDraft];
          }

          return [transaction.id, createDraft(transaction)];
        })
      )
    );
  }, [transactions]);

  function updateDraft(transactionId: string, updates: Partial<RowDraft>) {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [transactionId]: {
        ...currentDrafts[transactionId],
        ...updates,
        saved: updates.saved ?? false,
      },
    }));
  }

  async function saveTransaction(transactionId: string) {
    const draft = drafts[transactionId];
    if (draft.isSaving || draft.saved) {
      return;
    }

    if (savedTimersRef.current[transactionId]) {
      clearTimeout(savedTimersRef.current[transactionId]);
      delete savedTimersRef.current[transactionId];
    }

    updateDraft(transactionId, { isSaving: true, error: null, saved: false });

    const response = await fetch(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: draft.categoryId || null,
        notes: draft.notes,
        tag_ids: draft.tagIds,
        tag_names: draft.tagNames,
      }),
    });
    const data = (await response.json()) as { error?: string; tags?: Pick<Tag, 'id' | 'name' | 'color'>[] };

    if (!response.ok) {
      updateDraft(transactionId, { isSaving: false, error: data.error ?? 'Unable to save transaction.' });
      return;
    }

    if (data.tags?.length) {
      setTagOptions((currentTags) => {
        const tagById = new Map(currentTags.map((tag) => [tag.id, tag]));
        data.tags?.forEach((tag) => tagById.set(tag.id, tag));
        return Array.from(tagById.values()).sort((a, b) => a.name.localeCompare(b.name));
      });
      updateDraft(transactionId, {
        tagIds: data.tags.map((tag) => tag.id),
        tagNames: [],
      });
    }

    updateDraft(transactionId, { isSaving: false, error: null, saved: true });
    savedTimersRef.current[transactionId] = setTimeout(() => {
      updateDraft(transactionId, { saved: false });
      delete savedTimersRef.current[transactionId];
    }, 3_000);

    if (draft.tagNames.length > 0) {
      router.refresh();
    }
  }

  if (transactions.length === 0) {
    return null;
  }

  return (
    <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
      <Table stickyHeader sx={{ minWidth: 1500, tableLayout: 'fixed' }}>
      <TableHead>
        <TableRow>
          <TableCell sx={{ width: 112 }}>Date</TableCell>
          <TableCell sx={{ width: 280 }}>Description</TableCell>
          <TableCell sx={{ width: 160 }}>Account</TableCell>
          <TableCell sx={{ width: 210 }}>Category</TableCell>
          <TableCell sx={{ width: 280 }}>Tags</TableCell>
          <TableCell align="right" sx={{ width: 120 }}>
            Amount
          </TableCell>
          <TableCell sx={{ width: 105 }}>Status</TableCell>
          <TableCell sx={{ width: 125 }}>Environment</TableCell>
          <TableCell sx={{ width: 260 }}>Notes</TableCell>
          <TableCell
            align="right"
            sx={{
              width: 120,
              position: 'sticky',
              right: 0,
              bgcolor: 'background.paper',
              borderLeft: 1,
              borderColor: 'divider',
              zIndex: 2,
            }}
          >
            Save
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {transactions.map((transaction) => {
          const draft = drafts[transaction.id] ?? createDraft(transaction);
          return (
            <TableRow key={transaction.id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{transaction.date}</TableCell>
              <TableCell>
                <Stack spacing={0.25}>
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                    <Typography fontWeight={600}>{transaction.merchant_name ?? transaction.description}</Typography>
                    {transaction.transaction_split_count > 0 ? (
                      <Chip
                        size="small"
                        color="info"
                        variant="outlined"
                        icon={<CallSplitIcon />}
                        label={`Split ${transaction.transaction_split_count}`}
                      />
                    ) : null}
                  </Stack>
                  {transaction.merchant_name ? (
                    <Typography variant="body2" color="text.secondary">
                      {transaction.description}
                    </Typography>
                  ) : null}
                </Stack>
              </TableCell>
              <TableCell>{transaction.accounts?.name ?? '-'}</TableCell>
              <TableCell>
                <Select
                  size="small"
                  fullWidth
                  displayEmpty
                  value={draft.categoryId}
                  onChange={(event) => updateDraft(transaction.id, { categoryId: event.target.value })}
                >
                  <MenuItem value="">Uncategorized</MenuItem>
                  {categories.map((category) => (
                    <MenuItem key={category.id} value={category.id}>
                      {category.name}
                    </MenuItem>
                  ))}
                </Select>
              </TableCell>
              <TableCell>
                <TagAutocomplete
                  tags={tagOptions}
                  selectedTagIds={draft.tagIds}
                  newTagNames={draft.tagNames}
                  onChange={({ tagIds, tagNames }) => {
                    updateDraft(transaction.id, {
                      tagIds,
                      tagNames,
                    });
                  }}
                />
              </TableCell>
              <TableCell align="right">{formatCurrency(transaction.amount_cents)}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.75} flexWrap="wrap">
                  <Chip size="small" label={transaction.pending ? 'Pending' : 'Posted'} />
                </Stack>
              </TableCell>
              <TableCell>
                {transaction.plaid_environment ? (
                  <Chip size="small" variant="outlined" label={transaction.plaid_environment} />
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell>
                <TextField
                  size="small"
                  fullWidth
                  value={draft.notes}
                  onChange={(event) => updateDraft(transaction.id, { notes: event.target.value })}
                  placeholder="Note"
                />
                {draft.error ? (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    {draft.error}
                  </Alert>
                ) : null}
              </TableCell>
              <TableCell
                align="right"
                sx={{
                  position: 'sticky',
                  right: 0,
                  bgcolor: 'background.paper',
                  borderLeft: 1,
                  borderColor: 'divider',
                  zIndex: 1,
                }}
              >
                <Stack spacing={0.75} alignItems="flex-end">
                  <Button
                    size="small"
                    variant={draft.saved ? 'contained' : 'outlined'}
                    color={draft.saved ? 'success' : 'primary'}
                    startIcon={draft.saved ? <CheckIcon /> : <SaveIcon />}
                    disabled={draft.isSaving}
                    aria-disabled={draft.saved}
                    onClick={() => void saveTransaction(transaction.id)}
                    sx={{
                      minWidth: 96,
                      ...(draft.saved
                        ? {
                            pointerEvents: 'none',
                          }
                        : {}),
                    }}
                  >
                    {draft.isSaving ? 'Saving' : draft.saved ? 'Saved' : 'Save'}
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      </Table>
    </TableContainer>
  );
}
