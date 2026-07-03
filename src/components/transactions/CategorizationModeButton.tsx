'use client';

import { KeyboardEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import DeleteIcon from '@mui/icons-material/Delete';
import KeyboardBackspaceIcon from '@mui/icons-material/KeyboardBackspace';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import { formatCurrency, parseCurrencyToCents } from '@/lib/money';
import type { Category, Tag } from '@/types/database';
import TagAutocomplete from './TagAutocomplete';
import type { EditableTransactionRow } from './TransactionsTable';

interface CategorizationModeButtonProps {
  transactions: EditableTransactionRow[];
  categories: Pick<Category, 'id' | 'name'>[];
  tags: Pick<Tag, 'id' | 'name' | 'color'>[];
}

interface Draft {
  categoryId: string;
  notes: string;
  tagIds: string[];
  tagNames: string[];
  isSplit: boolean;
  splits: SplitDraft[];
}

interface SplitDraft {
  amount: string;
  categoryId: string;
  notes: string;
  tagIds: string[];
  tagNames: string[];
}

function createDraft(transaction: EditableTransactionRow | undefined): Draft {
  const firstSplit = transaction
    ? {
        amount: formatCurrency(transaction.amount_cents).replace('$', ''),
        categoryId: transaction.category_id ?? '',
        notes: transaction.notes ?? '',
        tagIds: transaction.transaction_tag_ids ?? [],
        tagNames: [],
      }
    : undefined;

  return {
    categoryId: transaction?.category_id ?? '',
    notes: transaction?.notes ?? '',
    tagIds: transaction?.transaction_tag_ids ?? [],
    tagNames: [],
    isSplit: false,
    splits: firstSplit ? [firstSplit] : [],
  };
}

function getSplitTotalCents(splits: SplitDraft[]): number {
  return splits.reduce((total, split) => {
    try {
      return total + parseCurrencyToCents(split.amount || '0');
    } catch {
      return total;
    }
  }, 0);
}

function getSplitRemainderCents(transactionAmountCents: number, splits: SplitDraft[], targetIndex: number): number {
  return transactionAmountCents - getSplitTotalCents(splits.filter((_, index) => index !== targetIndex));
}

function startSplitDraft(current: Draft, transactionAmountCents: number): Draft {
  const firstSplit = current.splits[0] ?? {
    amount: formatCurrency(transactionAmountCents).replace('$', ''),
    categoryId: current.categoryId,
    notes: current.notes,
    tagIds: current.tagIds,
    tagNames: current.tagNames,
  };

  return {
    ...current,
    isSplit: true,
    splits:
      current.splits.length >= 2
        ? current.splits
        : [
            {
              ...firstSplit,
              amount: formatCurrency(transactionAmountCents).replace('$', ''),
            },
            {
              amount: '0.00',
              categoryId: '',
              notes: '',
              tagIds: [],
              tagNames: [],
            },
          ],
  };
}

function cancelSplitDraft(current: Draft): Draft {
  const firstSplit = current.splits[0];

  return {
    ...current,
    categoryId: firstSplit?.categoryId ?? current.categoryId,
    notes: firstSplit?.notes ?? current.notes,
    tagIds: firstSplit?.tagIds ?? current.tagIds,
    tagNames: firstSplit?.tagNames ?? current.tagNames,
    isSplit: false,
    splits: firstSplit ? [firstSplit] : current.splits,
  };
}

export default function CategorizationModeButton({ transactions, categories, tags }: CategorizationModeButtonProps) {
  const router = useRouter();
  const [tagOptions, setTagOptions] = useState(tags);
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [skippedHistory, setSkippedHistory] = useState<EditableTransactionRow[]>([]);
  const [draft, setDraft] = useState<Draft>(() => createDraft(transactions[0]));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queue = useMemo(
    () => transactions.filter((transaction) => !completedIds.has(transaction.id)),
    [completedIds, transactions]
  );
  const currentTransaction = queue[currentIndex] ?? queue[0];
  const progressCount = completedIds.size;
  const totalCount = transactions.length;

  function openDialog() {
    setCurrentIndex(0);
    setCompletedIds(new Set());
    setSkippedIds(new Set());
    setSkippedHistory([]);
    setDraft(createDraft(transactions[0]));
    setError(null);
    setIsOpen(true);
  }

  function closeDialog() {
    setIsOpen(false);
    router.refresh();
  }

  function moveToNext(nextCompletedIds: Set<string>, nextSkippedIds = skippedIds) {
    const nextQueue = transactions.filter((transaction) => !nextCompletedIds.has(transaction.id));
    const nextIndex = Math.min(currentIndex, Math.max(nextQueue.length - 1, 0));
    const nextTransaction = nextQueue[nextIndex];

    setCompletedIds(nextCompletedIds);
    setSkippedIds(nextSkippedIds);
    setCurrentIndex(nextIndex);
    setDraft(createDraft(nextTransaction));

    if (!nextTransaction) {
      setIsOpen(false);
      router.refresh();
    }
  }

  async function saveAndNext() {
    if (!currentTransaction) {
      return;
    }

    if (!draft.isSplit && !draft.categoryId) {
      setError('Choose a category before saving.');
      return;
    }

    let splitPayload:
      | Array<{
          amount_cents: number;
          category_id: string | null;
          notes: string | null;
          tag_ids: string[];
          tag_names: string[];
        }>
      | undefined;

    if (draft.isSplit) {
      if (draft.splits.length < 2) {
        setError('Add at least two split rows.');
        return;
      }

      try {
        splitPayload = draft.splits.map((split) => ({
          amount_cents: parseCurrencyToCents(split.amount),
          category_id: split.categoryId || null,
          notes: split.notes,
          tag_ids: split.tagIds,
          tag_names: split.tagNames,
        }));
      } catch {
        setError('Enter valid split amounts.');
        return;
      }

      if (splitPayload.some((split) => !split.category_id)) {
        setError('Choose a category for each split row.');
        return;
      }

      const splitTotal = splitPayload.reduce((total, split) => total + split.amount_cents, 0);
      if (splitTotal !== currentTransaction.amount_cents) {
        setError('Split amounts must equal the transaction amount.');
        return;
      }
    }

    setIsSaving(true);
    setError(null);

    const response = await fetch(`/api/transactions/${currentTransaction.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: draft.isSplit ? null : draft.categoryId || null,
        notes: draft.isSplit ? null : draft.notes,
        tag_ids: draft.isSplit ? [] : draft.tagIds,
        tag_names: draft.isSplit ? [] : draft.tagNames,
        splits: splitPayload,
      }),
    });
    const data = (await response.json()) as { error?: string; tags?: Pick<Tag, 'id' | 'name' | 'color'>[] };

    setIsSaving(false);

    if (!response.ok) {
      setError(data.error ?? 'Unable to save transaction.');
      return;
    }

    if (data.tags?.length) {
      setTagOptions((currentTags) => {
        const tagById = new Map(currentTags.map((tag) => [tag.id, tag]));
        data.tags?.forEach((tag) => tagById.set(tag.id, tag));
        return Array.from(tagById.values()).sort((a, b) => a.name.localeCompare(b.name));
      });
    }

    const nextCompletedIds = new Set(completedIds);
    nextCompletedIds.add(currentTransaction.id);
    moveToNext(nextCompletedIds);
    router.refresh();
  }

  function skip() {
    if (!currentTransaction) {
      return;
    }

    const nextCompletedIds = new Set(completedIds);
    const nextSkippedIds = new Set(skippedIds);
    nextCompletedIds.add(currentTransaction.id);
    nextSkippedIds.add(currentTransaction.id);
    setSkippedHistory((currentSkippedHistory) => [...currentSkippedHistory, currentTransaction]);
    moveToNext(nextCompletedIds, nextSkippedIds);
  }

  function goBackToSkipped() {
    const skippedTransaction = skippedHistory[skippedHistory.length - 1];
    if (!skippedTransaction) {
      return;
    }

    const nextCompletedIds = new Set(completedIds);
    const nextSkippedIds = new Set(skippedIds);
    nextCompletedIds.delete(skippedTransaction.id);
    nextSkippedIds.delete(skippedTransaction.id);

    setSkippedHistory((currentSkippedHistory) => currentSkippedHistory.slice(0, -1));
    setCompletedIds(nextCompletedIds);
    setSkippedIds(nextSkippedIds);
    setCurrentIndex(0);
    setDraft(createDraft(skippedTransaction));
    setError(null);
  }

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<PlaylistAddCheckIcon />}
        disabled={transactions.length === 0}
        onClick={openDialog}
      >
        Categorize uncategorized ({transactions.length})
      </Button>
      <Dialog
        open={isOpen}
        onClose={closeDialog}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              void saveAndNext();
            }
          },
        }}
      >
        <DialogTitle>Categorize uncategorized</DialogTitle>
        <DialogContent dividers>
          {currentTransaction ? (
            <Stack spacing={2.5}>
              <Box>
                <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    {progressCount} of {totalCount} done
                  </Typography>
                  {skippedIds.size > 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      {skippedIds.size} skipped
                    </Typography>
                  ) : null}
                </Stack>
                <LinearProgress variant="determinate" value={totalCount ? (progressCount / totalCount) * 100 : 0} />
              </Box>

              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                  <Box>
                    <Typography variant="h6">{currentTransaction.merchant_name ?? currentTransaction.description}</Typography>
                    {currentTransaction.merchant_name ? (
                      <Typography color="text.secondary">{currentTransaction.description}</Typography>
                    ) : null}
                  </Box>
                  <Typography variant="h6">{formatCurrency(currentTransaction.amount_cents)}</Typography>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                  <Chip size="small" label={currentTransaction.date} />
                  <Chip size="small" label={currentTransaction.accounts?.name ?? 'Account'} />
                  <Chip size="small" label={currentTransaction.pending ? 'Pending' : 'Posted'} />
                </Stack>
              </Box>

              <Divider />

              <Stack spacing={2}>
                {!draft.isSplit ? (
                  <>
                    <Select
                      size="small"
                      fullWidth
                      displayEmpty
                      value={draft.categoryId}
                      onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))}
                    >
                      <MenuItem value="">Choose category</MenuItem>
                      {categories.map((category) => (
                        <MenuItem key={category.id} value={category.id}>
                          {category.name}
                        </MenuItem>
                      ))}
                    </Select>

                    <TagAutocomplete
                      tags={tagOptions}
                      selectedTagIds={draft.tagIds}
                      newTagNames={draft.tagNames}
                      onChange={({ tagIds, tagNames }) =>
                        setDraft((current) => ({
                          ...current,
                          tagIds,
                          tagNames,
                        }))
                      }
                    />

                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      minRows={3}
                      value={draft.notes}
                      onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Note"
                    />

                    <Button variant="outlined" onClick={() => setDraft((current) => startSplitDraft(current, currentTransaction.amount_cents))}>
                      Split transaction
                    </Button>
                  </>
                ) : (
                  <Stack spacing={1.5}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle2">Splits</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography
                          variant="body2"
                          color={
                            getSplitTotalCents(draft.splits) === currentTransaction.amount_cents
                              ? 'success.main'
                              : 'error.main'
                          }
                        >
                          {formatCurrency(getSplitTotalCents(draft.splits))} / {formatCurrency(currentTransaction.amount_cents)}
                        </Typography>
                        <Button
                          size="small"
                          color="inherit"
                          startIcon={<CloseIcon />}
                          onClick={() => setDraft((current) => cancelSplitDraft(current))}
                        >
                          Cancel split
                        </Button>
                      </Stack>
                    </Stack>

                    {draft.splits.map((split, index) => (
                      <Box key={index} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                        <Stack spacing={1.25}>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <TextField
                              size="small"
                              label="Amount"
                              value={split.amount}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  splits: current.splits.map((currentSplit, splitIndex) =>
                                    splitIndex === index ? { ...currentSplit, amount: event.target.value } : currentSplit
                                  ),
                                }))
                              }
                              sx={{ width: { xs: '100%', sm: 130 } }}
                            />
                            <Select
                              size="small"
                              fullWidth
                              displayEmpty
                              value={split.categoryId}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  splits: current.splits.map((currentSplit, splitIndex) =>
                                    splitIndex === index
                                      ? { ...currentSplit, categoryId: event.target.value }
                                      : currentSplit
                                  ),
                                }))
                              }
                            >
                              <MenuItem value="">Choose category</MenuItem>
                              {categories.map((category) => (
                                <MenuItem key={category.id} value={category.id}>
                                  {category.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </Stack>
                          <TagAutocomplete
                            tags={tagOptions}
                            selectedTagIds={split.tagIds}
                            newTagNames={split.tagNames}
                            onChange={({ tagIds, tagNames }) =>
                              setDraft((current) => ({
                                ...current,
                                splits: current.splits.map((currentSplit, splitIndex) =>
                                  splitIndex === index ? { ...currentSplit, tagIds, tagNames } : currentSplit
                                ),
                              }))
                            }
                          />
                          <TextField
                            size="small"
                            fullWidth
                            value={split.notes}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                splits: current.splits.map((currentSplit, splitIndex) =>
                                  splitIndex === index ? { ...currentSplit, notes: event.target.value } : currentSplit
                                ),
                              }))
                            }
                            placeholder="Split note"
                          />
                          <Stack direction="row" spacing={1} justifyContent="space-between">
                            <Button
                              size="small"
                              onClick={() =>
                                setDraft((current) => ({
                                  ...current,
                                  splits: current.splits.map((currentSplit, splitIndex) =>
                                    splitIndex === index
                                      ? {
                                          ...currentSplit,
                                          amount: formatCurrency(
                                            getSplitRemainderCents(currentTransaction.amount_cents, current.splits, index)
                                          ).replace('$', ''),
                                        }
                                      : currentSplit
                                  ),
                                }))
                              }
                            >
                              Fill remainder
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              startIcon={<DeleteIcon />}
                              disabled={draft.splits.length <= 1}
                              onClick={() =>
                                setDraft((current) => ({
                                  ...current,
                                  splits: current.splits.filter((_, splitIndex) => splitIndex !== index),
                                }))
                              }
                            >
                              Remove
                            </Button>
                          </Stack>
                        </Stack>
                      </Box>
                    ))}

                    <Button
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          splits: [
                            ...current.splits,
                            {
                              amount: '0.00',
                              categoryId: '',
                              notes: '',
                              tagIds: [],
                              tagNames: [],
                            },
                          ],
                        }))
                      }
                    >
                      Add split
                    </Button>
                  </Stack>
                )}
              </Stack>

              {error ? <Alert severity="error">{error}</Alert> : null}
            </Stack>
          ) : (
            <Alert severity="success">No uncategorized transactions left.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Close</Button>
          <Button
            startIcon={<KeyboardBackspaceIcon />}
            onClick={goBackToSkipped}
            disabled={skippedHistory.length === 0 || isSaving}
          >
            Back
          </Button>
          <Button startIcon={<SkipNextIcon />} onClick={skip} disabled={!currentTransaction || isSaving}>
            Skip
          </Button>
          <Button
            variant="contained"
            startIcon={<CheckIcon />}
            onClick={() => void saveAndNext()}
            disabled={!currentTransaction || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save and next'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
