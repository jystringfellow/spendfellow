'use client';

import { useEffect, useState } from 'react';
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
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Snackbar from '@mui/material/Snackbar';
import CategorizationModeButton from './CategorizationModeButton';
import { formatCurrency } from '@/lib/money';
import { type CreditCardPaymentLinkSummary } from './CreditCardPaymentLinkButton';
import {
  type FunMoneyAllocationSummary,
} from './FunMoneyAllocationButton';
import { type ManualTransactionAccountOption } from './ManualTransactionDialog';
import CategoryPicker from './CategoryPicker';
import type {
  BudgetTransactionGroup,
  Category,
  Tag,
  Transaction,
  TransactionBudgetExclusion,
} from '@/types/database';

const CREATE_BUDGET_GROUP_VALUE = '__create_budget_group__';

export interface EditableTransactionRow extends Transaction {
  transaction_splits?: { id: string; amount_cents: number; category_id: string | null; notes: string | null; tag_ids: string[] }[];
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
  const [discardBulk, setDiscardBulk] = useState(false);
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
  const [editorSession, setEditorSession] = useState<{ initial: EditableTransactionRow; transactions: EditableTransactionRow[] } | null>(null);
  function openEditor(transaction: EditableTransactionRow) {
    setEditorSession({ initial: transaction, transactions: [...transactions] });
  }
  const [notice, setNotice] = useState('');

  useEffect(() => { setTagOptions(tags); }, [tags]);
  useEffect(() => { setBudgetGroupOptions(budgetGroups); }, [budgetGroups]);
  useEffect(() => {
    setSelectedIds((current) => new Set([...current].filter((id) => transactions.some((transaction) => transaction.id === id))));
  }, [transactions]);

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
    if (isBulkSaving) return;
    if (applyBulkCategory || applyBulkTags || applyBulkBudgetGroup) setDiscardBulk(true);
    else setBulkEditorOpen(false);
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

    try {
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

      setNotice(`Updated ${transactionIds.length} transactions.`);
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
    } catch {
      setBulkError('Unable to reach the server. Your selection is kept; try again.');
    } finally {
      setIsBulkSaving(false);
    }
  }

  if (transactions.length === 0) {
    return null;
  }

  return (
    <>
      {selectedIds.size > 0 ? <Box role="region" aria-label="Selected transactions" sx={{ position: 'sticky', top: 0, zIndex: 2, px: 2, py: 1.5, bgcolor: 'background.default', color: 'text.primary', borderBottom: 1, borderColor: 'divider' }}>
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
      </Box> : <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
        Click a transaction to edit it. Use the checkboxes to edit several at once.
      </Typography>}
      <Dialog aria-labelledby="bulk-editor-title" open={bulkEditorOpen} onClose={closeBulkEditor} fullWidth maxWidth="sm">
        <DialogTitle id="bulk-editor-title">Bulk edit {selectedIds.size} transactions</DialogTitle>
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
              <CategoryPicker
                categories={categories}
                label="Bulk category"
                value={bulkCategoryId}
                onChange={setBulkCategoryId}
                disabled={!applyBulkCategory || isBulkSaving}
              />
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
        <Table stickyHeader sx={{ minWidth: 850 }} aria-label="Transactions">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox checked={selectedIds.size === transactions.length}
                  indeterminate={selectedIds.size > 0 && selectedIds.size < transactions.length}
                  onChange={toggleAllSelected} inputProps={{ 'aria-label': 'Select all transactions on this page' }} />
              </TableCell>
              <TableCell>Date</TableCell><TableCell>Transaction</TableCell><TableCell>Account</TableCell>
              <TableCell align="right">Amount</TableCell><TableCell>Category</TableCell><TableCell>Tags</TableCell><TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {transactions.map((transaction) => (
              <TableRow key={transaction.id} hover selected={selectedIds.has(transaction.id)} tabIndex={-1}
                onClick={(event) => { event.currentTarget.focus(); openEditor(transaction); }} sx={{ cursor: 'pointer' }}>
                <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                  <Checkbox checked={selectedIds.has(transaction.id)} onChange={() => toggleSelected(transaction.id)}
                    inputProps={{ 'aria-label': `Select ${transaction.merchant_name ?? transaction.description}` }} />
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{transaction.date}</TableCell>
                <TableCell sx={{ maxWidth: 330 }}>
                  <Typography fontWeight={600}>{transaction.merchant_name ?? transaction.description}</Typography>
                  {transaction.merchant_name ? <Typography variant="body2" color="text.secondary">{transaction.description}</Typography> : null}
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {transaction.pending ? <Chip size="small" label="Pending" variant="outlined" /> : null}
                    {transaction.source === 'manual' ? <Chip size="small" label="Manual" variant="outlined" /> : null}
                    {transaction.credit_card_payment_link || transaction.budget_exclusion ? <Chip size="small" color="secondary" label="CC payment" variant="outlined" /> : null}
                    {transaction.budget_group ? <Chip size="small" label={transaction.budget_group.name} variant="outlined" /> : null}
                  </Stack>
                  {transaction.notes ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{transaction.notes}</Typography> : null}
                </TableCell>
                <TableCell>{transaction.accounts?.name ?? '—'}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 650, color: transaction.amount_cents < 0 ? 'success.main' : 'text.primary' }}>{formatCurrency(transaction.amount_cents)}</TableCell>
                <TableCell>
                  {transaction.transaction_split_count > 0 ? <Chip size="small" color="secondary" variant="outlined" label={`${transaction.transaction_split_count} splits`} />
                    : transaction.category_id ? categories.find((category) => category.id === transaction.category_id)?.name ?? 'Category unavailable'
                    : <Chip size="small" color="warning" variant="outlined" label="Uncategorized" />}
                </TableCell>
                <TableCell><Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {transaction.transaction_tag_ids.map((id) => <Chip key={id} size="small" variant="outlined" label={tagOptions.find((tag) => tag.id === id)?.name ?? 'Tag unavailable'} />)}
                </Stack></TableCell>
                <TableCell align="right">
                  <Button size="small" startIcon={<EditOutlinedIcon />} aria-label={`Edit ${transaction.merchant_name ?? transaction.description}`}
                    onClick={(event) => { event.stopPropagation(); openEditor(transaction); }}>Edit</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {editorSession ? (
        <CategorizationModeButton key={editorSession.initial.id} transactions={editorSession.transactions} categories={categories} tags={tagOptions}
          budgetGroups={budgetGroupOptions} accounts={accounts} initialTransaction={editorSession.initial}
          onEditorClose={() => setEditorSession(null)} onSaved={() => setNotice('Transaction saved.')} />
      ) : null}
      <Dialog open={discardBulk} onClose={() => setDiscardBulk(false)} aria-labelledby="discard-bulk-title">
        <DialogTitle id="discard-bulk-title">Discard bulk changes?</DialogTitle>
        <DialogContent>The selected transactions have not been changed.</DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardBulk(false)}>Keep editing</Button>
          <Button color="error" onClick={() => {
            setDiscardBulk(false); setBulkEditorOpen(false); setApplyBulkCategory(false); setApplyBulkTags(false); setApplyBulkBudgetGroup(false);
            setBulkCategoryId(''); setBulkTagIds([]); setBulkBudgetGroupId(''); setBulkBudgetGroupName('');
          }}>Discard changes</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice('')} message={notice} />
    </>
  );
}
