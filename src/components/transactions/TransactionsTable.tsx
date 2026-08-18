'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
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
import CreditCardPaymentLinkButton, { type CreditCardPaymentLinkSummary } from './CreditCardPaymentLinkButton';
import FunMoneyAllocationButton, {
  type FunMoneyAllocationSummary,
} from './FunMoneyAllocationButton';
import ManualTransactionDialog, { type ManualTransactionAccountOption } from './ManualTransactionDialog';
import TagAutocomplete from './TagAutocomplete';
import type {
  BudgetTransactionGroup,
  Category,
  Tag,
  Transaction,
  TransactionBudgetExclusion,
} from '@/types/database';

const CREATE_BUDGET_GROUP_VALUE = '__create_budget_group__';

export interface EditableTransactionRow extends Transaction {
  accounts: {
    name: string;
    type: string;
    source: 'plaid' | 'manual';
  } | null;
  amazon_match?: AmazonTransactionMatch | null;
  transaction_tag_ids: string[];
  transaction_split_count: number;
  credit_card_payment_link?: CreditCardPaymentLinkSummary | null;
  budget_exclusion?: TransactionBudgetExclusion | null;
  fun_money_allocations: FunMoneyAllocationSummary[];
  budget_group: Pick<BudgetTransactionGroup, 'id' | 'name'> | null;
}

export interface AmazonTransactionMatch {
  paymentTransactionId: string;
  orderId: string;
  transactionDate: string | null;
  amountCents: number;
  merchantText: string | null;
  isRefund: boolean;
  order: {
    orderDetailUrl: string | null;
    itemSubtotalCents: number | null;
    shippingCents: number | null;
    discountsCents: number | null;
    taxCents: number | null;
    grandTotalCents: number | null;
  } | null;
  items: AmazonOrderItemMatch[];
}

export interface AmazonOrderItemMatch {
  id: string;
  title: string;
  priceCents: number | null;
  asin: string | null;
  quantity: number | null;
  sortOrder: number;
}

interface TransactionsTableProps {
  transactions: EditableTransactionRow[];
  categories: Pick<
    Category,
    'id' | 'name' | 'is_income' | 'rollover_enabled' | 'rollover_start_date'
  >[];
  tags: Pick<Tag, 'id' | 'name' | 'color'>[];
  accounts: ManualTransactionAccountOption[];
  budgetGroups: Pick<BudgetTransactionGroup, 'id' | 'name'>[];
}

interface RowDraft {
  budgetGroupId: string;
  budgetGroupName: string;
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
    budgetGroupId: transaction.budget_group?.id ?? '',
    budgetGroupName: '',
    categoryId: transaction.category_id ?? '',
    notes: transaction.notes ?? '',
    tagIds: transaction.transaction_tag_ids,
    tagNames: [],
    isSaving: false,
    error: null,
    saved: false,
  };
}

export default function TransactionsTable({
  transactions,
  categories,
  tags,
  accounts,
  budgetGroups,
}: TransactionsTableProps) {
  const router = useRouter();
  const [tagOptions, setTagOptions] = useState(tags);
  const [budgetGroupOptions, setBudgetGroupOptions] = useState(budgetGroups);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [applyBulkCategory, setApplyBulkCategory] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [applyBulkTags, setApplyBulkTags] = useState(false);
  const [bulkTagMode, setBulkTagMode] = useState<'add' | 'remove'>('add');
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([]);
  const [applyBulkBudgetGroup, setApplyBulkBudgetGroup] = useState(false);
  const [bulkBudgetGroupId, setBulkBudgetGroupId] = useState('');
  const [bulkBudgetGroupName, setBulkBudgetGroupName] = useState('');
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(transactions.map((transaction) => [transaction.id, createDraft(transaction)]))
  );
  const savedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    setTagOptions(tags);
  }, [tags]);

  useEffect(() => {
    setBudgetGroupOptions(budgetGroups);
  }, [budgetGroups]);

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
    setSelectedIds(
      (currentIds) =>
        new Set(
          [...currentIds].filter((transactionId) =>
            transactions.some((transaction) => transaction.id === transactionId)
          )
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

    if (draft.budgetGroupId === CREATE_BUDGET_GROUP_VALUE && !draft.budgetGroupName.trim()) {
      updateDraft(transactionId, { error: 'Enter a name for the new budget group.' });
      return;
    }

    updateDraft(transactionId, { isSaving: true, error: null, saved: false });

    const response = await fetch(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        budget_group_id:
          draft.budgetGroupId && draft.budgetGroupId !== CREATE_BUDGET_GROUP_VALUE
            ? draft.budgetGroupId
            : null,
        budget_group_name:
          draft.budgetGroupId === CREATE_BUDGET_GROUP_VALUE ? draft.budgetGroupName : null,
        category_id: draft.categoryId || null,
        notes: draft.notes,
        tag_ids: draft.tagIds,
        tag_names: draft.tagNames,
      }),
    });
    const data = (await response.json()) as {
      budget_group?: Pick<BudgetTransactionGroup, 'id' | 'name'> | null;
      error?: string;
      tags?: Pick<Tag, 'id' | 'name' | 'color'>[];
    };

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

    if (data.budget_group) {
      setBudgetGroupOptions((currentGroups) => {
        const groupById = new Map(currentGroups.map((group) => [group.id, group]));
        groupById.set(data.budget_group!.id, data.budget_group!);
        return Array.from(groupById.values()).sort((left, right) => left.name.localeCompare(right.name));
      });
    }

    updateDraft(transactionId, {
      budgetGroupId: data.budget_group?.id ?? '',
      budgetGroupName: '',
      isSaving: false,
      error: null,
      saved: true,
    });
    savedTimersRef.current[transactionId] = setTimeout(() => {
      updateDraft(transactionId, { saved: false });
      delete savedTimersRef.current[transactionId];
    }, 3_000);

    if (draft.tagNames.length > 0 || draft.budgetGroupId === CREATE_BUDGET_GROUP_VALUE) {
      router.refresh();
    }
  }

  function toggleSelected(transactionId: string) {
    setSelectedIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(transactionId)) {
        nextIds.delete(transactionId);
      } else {
        nextIds.add(transactionId);
      }
      return nextIds;
    });
  }

  function toggleAllSelected() {
    setSelectedIds((currentIds) =>
      currentIds.size === transactions.length ? new Set() : new Set(transactions.map((transaction) => transaction.id))
    );
  }

  function openBulkEditor() {
    setBulkError(null);
    setBulkEditorOpen(true);
  }

  function closeBulkEditor() {
    if (!isBulkSaving) {
      setBulkEditorOpen(false);
    }
  }

  async function applyBulkEdits() {
    const transactionIds = [...selectedIds];
    if (transactionIds.length === 0 || isBulkSaving) {
      return;
    }

    if (!applyBulkCategory && !applyBulkTags && !applyBulkBudgetGroup) {
      setBulkError('Choose at least one property to update.');
      return;
    }
    if (applyBulkTags && bulkTagIds.length === 0) {
      setBulkError('Choose at least one tag.');
      return;
    }
    if (
      applyBulkBudgetGroup &&
      bulkBudgetGroupId === CREATE_BUDGET_GROUP_VALUE &&
      !bulkBudgetGroupName.trim()
    ) {
      setBulkError('Enter a name for the new budget group.');
      return;
    }

    setIsBulkSaving(true);
    setBulkError(null);

    const response = await fetch('/api/transactions/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_ids: transactionIds,
        category: applyBulkCategory ? { category_id: bulkCategoryId || null } : undefined,
        tags: applyBulkTags ? { mode: bulkTagMode, tag_ids: bulkTagIds } : undefined,
        budget_group: applyBulkBudgetGroup
          ? {
              group_id:
                bulkBudgetGroupId && bulkBudgetGroupId !== CREATE_BUDGET_GROUP_VALUE
                  ? bulkBudgetGroupId
                  : null,
              group_name:
                bulkBudgetGroupId === CREATE_BUDGET_GROUP_VALUE ? bulkBudgetGroupName : null,
            }
          : undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      budget_group?: Pick<BudgetTransactionGroup, 'id' | 'name'> | null;
      error?: string;
    };

    if (!response.ok) {
      setIsBulkSaving(false);
      setBulkError(data.error ?? 'Unable to update the selected transactions.');
      return;
    }

    if (data.budget_group) {
        setBudgetGroupOptions((currentGroups) => {
          const groupById = new Map(currentGroups.map((group) => [group.id, group]));
          groupById.set(data.budget_group!.id, data.budget_group!);
          return Array.from(groupById.values()).sort((left, right) => left.name.localeCompare(right.name));
        });
    }

    transactionIds.forEach((transactionId) => {
      const currentDraft = drafts[transactionId];
      const nextTagIds = applyBulkTags
        ? bulkTagMode === 'add'
          ? Array.from(new Set([...(currentDraft?.tagIds ?? []), ...bulkTagIds]))
          : (currentDraft?.tagIds ?? []).filter((tagId) => !bulkTagIds.includes(tagId))
        : currentDraft?.tagIds;
      updateDraft(transactionId, {
          categoryId: applyBulkCategory ? bulkCategoryId : currentDraft?.categoryId,
          tagIds: nextTagIds,
          budgetGroupId: applyBulkBudgetGroup ? data.budget_group?.id ?? '' : currentDraft?.budgetGroupId,
          budgetGroupName: '',
        });
    });
    setSelectedIds(new Set());
    setBulkEditorOpen(false);
    setApplyBulkCategory(false);
    setApplyBulkTags(false);
    setApplyBulkBudgetGroup(false);
    setBulkTagIds([]);
    setBulkBudgetGroupId('');
    setBulkBudgetGroupName('');
    setIsBulkSaving(false);
    router.refresh();
  }

  if (transactions.length === 0) {
    return null;
  }

  return (
    <>
      <Box sx={{ px: 2, py: 1.5, bgcolor: 'grey.50', borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
          <Typography variant="body2" sx={{ minWidth: 150 }}>
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select rows for bulk editing'}
          </Typography>
          <Button
            variant="outlined"
            disabled={selectedIds.size === 0}
            onClick={openBulkEditor}
          >
            Bulk edit
          </Button>
          <Button
            color="inherit"
            disabled={selectedIds.size === 0}
            onClick={() => setSelectedIds(new Set())}
          >
            Clear selection
          </Button>
        </Stack>
      </Box>
      <Dialog open={bulkEditorOpen} onClose={closeBulkEditor} fullWidth maxWidth="sm">
        <DialogTitle>Bulk edit {selectedIds.size} transactions</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={applyBulkCategory}
                    onChange={(event) => setApplyBulkCategory(event.target.checked)}
                  />
                }
                label="Change category"
              />
              <Select
                size="small"
                fullWidth
                displayEmpty
                value={bulkCategoryId}
                onChange={(event) => setBulkCategoryId(event.target.value)}
                disabled={!applyBulkCategory || isBulkSaving}
              >
                <MenuItem value="">Uncategorized</MenuItem>
                {categories.map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    {category.name}
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary">
                Split transactions cannot have their category changed in bulk.
              </Typography>
            </Box>

            <Divider />

            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={applyBulkTags}
                    onChange={(event) => setApplyBulkTags(event.target.checked)}
                  />
                }
                label="Change tags"
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Select
                  size="small"
                  value={bulkTagMode}
                  onChange={(event) => setBulkTagMode(event.target.value as 'add' | 'remove')}
                  disabled={!applyBulkTags || isBulkSaving}
                  sx={{ minWidth: 110 }}
                >
                  <MenuItem value="add">Add</MenuItem>
                  <MenuItem value="remove">Remove</MenuItem>
                </Select>
                <Select
                  size="small"
                  multiple
                  fullWidth
                  displayEmpty
                  value={bulkTagIds}
                  onChange={(event) =>
                    setBulkTagIds(
                      typeof event.target.value === 'string'
                        ? event.target.value.split(',')
                        : event.target.value
                    )
                  }
                  disabled={!applyBulkTags || isBulkSaving}
                  renderValue={(selected) =>
                    selected.length > 0
                      ? selected
                          .map((tagId) => tagOptions.find((tag) => tag.id === tagId)?.name ?? tagId)
                          .join(', ')
                      : 'Choose tags'
                  }
                >
                  {tagOptions.map((tag) => (
                    <MenuItem key={tag.id} value={tag.id}>
                      <Checkbox checked={bulkTagIds.includes(tag.id)} />
                      {tag.name}
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
            </Box>

            <Divider />

            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={applyBulkBudgetGroup}
                    onChange={(event) => setApplyBulkBudgetGroup(event.target.checked)}
                  />
                }
                label="Change budget group"
              />
              <Select
                size="small"
                fullWidth
                displayEmpty
                value={bulkBudgetGroupId}
                onChange={(event) => {
                  setBulkBudgetGroupId(event.target.value);
                  if (event.target.value !== CREATE_BUDGET_GROUP_VALUE) {
                    setBulkBudgetGroupName('');
                  }
                }}
                disabled={!applyBulkBudgetGroup || isBulkSaving}
              >
                <MenuItem value="">Remove budget group</MenuItem>
                {budgetGroupOptions.map((group) => (
                  <MenuItem key={group.id} value={group.id}>
                    {group.name}
                  </MenuItem>
                ))}
                <Divider />
                <MenuItem value={CREATE_BUDGET_GROUP_VALUE}>Create a new budget group…</MenuItem>
              </Select>
              {applyBulkBudgetGroup && bulkBudgetGroupId === CREATE_BUDGET_GROUP_VALUE ? (
                <TextField
                  size="small"
                  fullWidth
                  label="New group name"
                  value={bulkBudgetGroupName}
                  onChange={(event) => setBulkBudgetGroupName(event.target.value)}
                  inputProps={{ maxLength: 80 }}
                  disabled={isBulkSaving}
                  sx={{ mt: 1 }}
                />
              ) : null}
            </Box>

            {bulkError ? <Alert severity="error">{bulkError}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeBulkEditor} disabled={isBulkSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void applyBulkEdits()} disabled={isBulkSaving}>
            {isBulkSaving ? 'Applying…' : 'Apply changes'}
          </Button>
        </DialogActions>
      </Dialog>
      <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
      <Table stickyHeader sx={{ minWidth: 1540, tableLayout: 'fixed' }}>
      <TableHead>
        <TableRow>
          <TableCell padding="checkbox" sx={{ width: 52 }}>
            <Checkbox
              checked={selectedIds.size === transactions.length}
              indeterminate={selectedIds.size > 0 && selectedIds.size < transactions.length}
              onChange={toggleAllSelected}
              inputProps={{ 'aria-label': 'Select all transactions on this page' }}
            />
          </TableCell>
          <TableCell sx={{ width: 112 }}>Date</TableCell>
          <TableCell sx={{ width: 280 }}>Description</TableCell>
          <TableCell sx={{ width: 160 }}>Account</TableCell>
          <TableCell align="right" sx={{ width: 120 }}>
            Amount
          </TableCell>
          <TableCell sx={{ width: 210 }}>Category</TableCell>
          <TableCell sx={{ width: 220 }}>Budget group</TableCell>
          <TableCell sx={{ width: 280 }}>Tags</TableCell>
          <TableCell sx={{ width: 105 }}>Status</TableCell>
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
              <TableCell padding="checkbox">
                <Checkbox
                  checked={selectedIds.has(transaction.id)}
                  onChange={() => toggleSelected(transaction.id)}
                  inputProps={{ 'aria-label': `Select ${transaction.merchant_name ?? transaction.description}` }}
                />
              </TableCell>
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
                    {transaction.source === 'manual' ? <Chip size="small" variant="outlined" label="Manual" /> : null}
                    {transaction.credit_card_payment_link || transaction.budget_exclusion ? (
                      <Chip
                        size="small"
                        color="secondary"
                        variant="outlined"
                        label={transaction.credit_card_payment_link ? 'CC payment · linked' : 'CC payment'}
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
              <TableCell align="right">{formatCurrency(transaction.amount_cents)}</TableCell>
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
                <Stack spacing={0.75}>
                  <Select
                    size="small"
                    fullWidth
                    displayEmpty
                    value={draft.budgetGroupId}
                    onChange={(event) =>
                      updateDraft(transaction.id, {
                        budgetGroupId: event.target.value,
                        budgetGroupName:
                          event.target.value === CREATE_BUDGET_GROUP_VALUE
                            ? draft.budgetGroupName
                            : '',
                      })
                    }
                  >
                    <MenuItem value="">No group</MenuItem>
                    {budgetGroupOptions.map((group) => (
                      <MenuItem key={group.id} value={group.id}>
                        {group.name}
                      </MenuItem>
                    ))}
                    <Divider />
                    <MenuItem value={CREATE_BUDGET_GROUP_VALUE}>Create new…</MenuItem>
                  </Select>
                  {draft.budgetGroupId === CREATE_BUDGET_GROUP_VALUE ? (
                    <TextField
                      size="small"
                      value={draft.budgetGroupName}
                      onChange={(event) =>
                        updateDraft(transaction.id, { budgetGroupName: event.target.value })
                      }
                      placeholder="Group name"
                      inputProps={{ maxLength: 80 }}
                    />
                  ) : null}
                </Stack>
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
              <TableCell>
                <Stack direction="row" spacing={0.75} flexWrap="wrap">
                  <Chip size="small" label={transaction.pending ? 'Pending' : 'Posted'} />
                  <CreditCardPaymentLinkButton
                    transactionId={transaction.id}
                    link={transaction.credit_card_payment_link ?? null}
                    marked={transaction.budget_exclusion?.reason === 'credit_card_payment'}
                    eligible={
                      !transaction.pending &&
                      ((transaction.accounts?.type === 'depository' && transaction.amount_cents > 0) ||
                        (transaction.accounts?.type === 'credit' && transaction.amount_cents < 0))
                    }
                  />
                  <FunMoneyAllocationButton
                    transactionId={transaction.id}
                    transactionDate={transaction.date}
                    transactionAmountCents={transaction.amount_cents}
                    transactionDescription={transaction.merchant_name ?? transaction.description}
                    categories={categories}
                    allocations={transaction.fun_money_allocations}
                    eligible={
                      !transaction.pending &&
                      transaction.amount_cents < 0 &&
                      !transaction.credit_card_payment_link &&
                      !transaction.budget_exclusion
                    }
                  />
                </Stack>
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
                  {transaction.source === 'manual' ? (
                    <ManualTransactionDialog
                      accounts={accounts}
                      categories={categories}
                      transaction={transaction}
                      compact
                    />
                  ) : null}
                </Stack>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      </Table>
      </TableContainer>
    </>
  );
}
