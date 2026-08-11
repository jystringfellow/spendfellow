'use client';

import { KeyboardEvent, useEffect, useState } from 'react';
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
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import { findUniqueAmazonRefundItemIds } from '@/lib/amazonRefundItems';
import { allocateAmazonSplitAmounts } from '@/lib/amazonSplitAllocation';
import { formatCurrency, parseCurrencyToCents } from '@/lib/money';
import type { BudgetTransactionGroup, Category, Tag } from '@/types/database';
import TagAutocomplete from './TagAutocomplete';
import CreditCardPaymentLinkButton from './CreditCardPaymentLinkButton';
import FunMoneyAllocationButton from './FunMoneyAllocationButton';
import type { EditableTransactionRow } from './TransactionsTable';

interface CategorizationModeButtonProps {
  transactions: EditableTransactionRow[];
  categories: Pick<
    Category,
    'id' | 'name' | 'is_income' | 'rollover_enabled' | 'rollover_start_date'
  >[];
  tags: Pick<Tag, 'id' | 'name' | 'color'>[];
  budgetGroups: Pick<BudgetTransactionGroup, 'id' | 'name'>[];
}

interface Draft {
  budgetGroupId: string;
  budgetGroupName: string;
  categoryId: string;
  notes: string;
  tagIds: string[];
  tagNames: string[];
  isSplit: boolean;
  splits: SplitDraft[];
}

const CREATE_BUDGET_GROUP_VALUE = '__create_budget_group__';

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
    budgetGroupId: transaction?.budget_group?.id ?? '',
    budgetGroupName: '',
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

function getAmazonItemTotalCents(priceCents: number | null, quantity: number | null): number | null {
  if (priceCents === null) {
    return null;
  }

  return priceCents * Math.max(1, quantity ?? 1);
}

function stripCurrencySymbol(value: string) {
  return value.replace('$', '');
}

function hasNonZeroCents(value: number | null) {
  return value !== null && value !== 0;
}

function getAmazonItemsTotalCents(transaction: EditableTransactionRow): number | null {
  const itemTotals = (transaction.amazon_match?.items ?? [])
    .map((item) => getAmazonItemTotalCents(item.priceCents, item.quantity))
    .filter((value): value is number => value !== null);

  if (itemTotals.length === 0) {
    return null;
  }

  return itemTotals.reduce((total, value) => total + value, 0);
}

function getAmazonDisplayItemSubtotalCents(transaction: EditableTransactionRow): number | null {
  const itemSubtotalCents = transaction.amazon_match?.order?.itemSubtotalCents ?? null;
  if (hasNonZeroCents(itemSubtotalCents)) {
    return itemSubtotalCents;
  }

  return getAmazonItemsTotalCents(transaction);
}

function getAmazonBeforeTaxCents(transaction: EditableTransactionRow): number | null {
  const order = transaction.amazon_match?.order;
  if (!order) {
    return null;
  }

  const hasSummaryParts =
    hasNonZeroCents(order.itemSubtotalCents) ||
    hasNonZeroCents(order.discountsCents) ||
    hasNonZeroCents(order.shippingCents);
  if (!hasSummaryParts) {
    if (order.grandTotalCents !== null && order.taxCents !== null) {
      return order.taxCents > order.grandTotalCents / 2 ? order.taxCents : order.grandTotalCents - order.taxCents;
    }

    return null;
  }

  const subtotal = order.itemSubtotalCents ?? 0;
  const shipping = order.shippingCents ?? 0;
  const discounts = order.discountsCents ?? 0;
  return subtotal + shipping + discounts;
}

function getAmazonDisplayTaxCents(transaction: EditableTransactionRow): number | null {
  const order = transaction.amazon_match?.order;
  if (!order) {
    return null;
  }

  const beforeTaxCents = getAmazonBeforeTaxCents(transaction);
  if (beforeTaxCents !== null && order.grandTotalCents !== null && order.taxCents !== null) {
    const inferredTaxCents = order.grandTotalCents - beforeTaxCents;
    if (order.taxCents === beforeTaxCents || order.itemSubtotalCents === null) {
      return inferredTaxCents;
    }
  }

  return order.taxCents;
}

function getAmazonDisplayDiscountsCents(transaction: EditableTransactionRow): number | null {
  const order = transaction.amazon_match?.order;
  if (!order) {
    return null;
  }

  if (hasNonZeroCents(order.discountsCents)) {
    return order.discountsCents;
  }

  const beforeTaxCents = getAmazonBeforeTaxCents(transaction);
  const itemSubtotalCents = getAmazonDisplayItemSubtotalCents(transaction);
  if (beforeTaxCents === null || itemSubtotalCents === null) {
    return order.discountsCents;
  }

  const inferredDiscountsCents = beforeTaxCents - itemSubtotalCents - (order.shippingCents ?? 0);
  return inferredDiscountsCents === 0 ? order.discountsCents : inferredDiscountsCents;
}

function createAmazonSplitDrafts(transaction: EditableTransactionRow, incomeCategoryId: string): SplitDraft[] {
  if (
    !transaction.amazon_match ||
    transaction.amazon_match.isRefund ||
    transaction.amount_cents <= 0 ||
    transaction.amazon_match.items.length === 0
  ) {
    return [];
  }

  const validItems = transaction.amazon_match.items.flatMap((item) => {
    const totalCents = getAmazonItemTotalCents(item.priceCents, item.quantity);
    if (totalCents === null || totalCents <= 0) {
      return [];
    }

    return [
      {
        item,
        totalCents,
      },
    ];
  });

  const allocation = allocateAmazonSplitAmounts(
    validItems.map(({ item, totalCents }) => ({ id: item.id, amountCents: totalCents })),
    transaction.amount_cents,
    transaction.amazon_match.order?.grandTotalCents ?? null
  );
  if (!allocation) {
    return [];
  }

  const allocatedAmountByItemId = new Map(allocation.itemAmounts.map((item) => [item.id, item.amountCents]));
  const itemSplits: SplitDraft[] = validItems.map(({ item }) => ({
    amount: stripCurrencySymbol(formatCurrency(allocatedAmountByItemId.get(item.id) ?? 0)),
    categoryId: '',
    notes: item.title,
    tagIds: [],
    tagNames: [],
  }));

  if (allocation.creditCents > 0) {
    itemSplits.push({
      amount: stripCurrencySymbol(formatCurrency(-allocation.creditCents)),
      categoryId: incomeCategoryId,
      notes: 'Amazon gift card or promotional credit',
      tagIds: [],
      tagNames: [],
    });
  }

  return itemSplits.length >= 2 ? itemSplits : [];
}

function getSingleAmazonItem(items: NonNullable<EditableTransactionRow['amazon_match']>['items']) {
  return items.length === 1 ? items[0] : null;
}

export default function CategorizationModeButton({
  transactions,
  categories,
  tags,
  budgetGroups,
}: CategorizationModeButtonProps) {
  const router = useRouter();
  const [tagOptions, setTagOptions] = useState(tags);
  const [budgetGroupOptions, setBudgetGroupOptions] = useState(budgetGroups);
  const [isOpen, setIsOpen] = useState(false);
  const [sessionTransactions, setSessionTransactions] = useState<EditableTransactionRow[]>([]);
  const [currentTransaction, setCurrentTransaction] = useState<EditableTransactionRow>();
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [skippedHistory, setSkippedHistory] = useState<EditableTransactionRow[]>([]);
  const [draft, setDraft] = useState<Draft>(() => createDraft(undefined));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incomeCategoryId =
    categories.find((category) => category.is_income && category.name.toLowerCase() === 'income transfers')?.id ??
    categories.find((category) => category.is_income)?.id ??
    '';
  const amazonItems = currentTransaction?.amazon_match?.items ?? [];
  const inferredRefundItemIds =
    currentTransaction?.amazon_match?.isRefund && amazonItems.length > 0
      ? findUniqueAmazonRefundItemIds(
          amazonItems.flatMap((item) => {
            const amountCents = getAmazonItemTotalCents(item.priceCents, item.quantity);
            return amountCents !== null && amountCents > 0 ? [{ id: item.id, amountCents }] : [];
          }),
          currentTransaction.amazon_match.amountCents,
          currentTransaction.amazon_match.order?.grandTotalCents ?? null
        )
      : null;
  const amazonDisplayItems = inferredRefundItemIds
    ? amazonItems.filter((item) => inferredRefundItemIds.includes(item.id))
    : amazonItems;
  const amazonRefundItemsFiltered = Boolean(
    currentTransaction?.amazon_match?.isRefund &&
      inferredRefundItemIds &&
      amazonDisplayItems.length < amazonItems.length
  );
  const amazonRefundItemsAmbiguous = Boolean(
    currentTransaction?.amazon_match?.isRefund &&
      amazonItems.length > 1 &&
      inferredRefundItemIds === null
  );
  const amazonRefundItemMatchFound = Boolean(
    currentTransaction?.amazon_match?.isRefund && inferredRefundItemIds
  );
  const amazonSplitDrafts = currentTransaction ? createAmazonSplitDrafts(currentTransaction, incomeCategoryId) : [];
  const singleAmazonItem = getSingleAmazonItem(amazonDisplayItems);
  const amazonDisplayItemSubtotalCents = currentTransaction ? getAmazonDisplayItemSubtotalCents(currentTransaction) : null;
  const amazonDisplayDiscountsCents = currentTransaction ? getAmazonDisplayDiscountsCents(currentTransaction) : null;
  const amazonBeforeTaxCents = currentTransaction ? getAmazonBeforeTaxCents(currentTransaction) : null;
  const amazonDisplayTaxCents = currentTransaction ? getAmazonDisplayTaxCents(currentTransaction) : null;
  const progressCount = completedIds.size;
  const totalCount = sessionTransactions.length;

  useEffect(() => {
    setBudgetGroupOptions(budgetGroups);
  }, [budgetGroups]);

  function openDialog() {
    const nextSessionTransactions = [...transactions];
    setSessionTransactions(nextSessionTransactions);
    setCurrentTransaction(nextSessionTransactions[0]);
    setCompletedIds(new Set());
    setSkippedIds(new Set());
    setSkippedHistory([]);
    setDraft(createDraft(nextSessionTransactions[0]));
    setError(null);
    setIsOpen(true);
  }

  function closeDialog() {
    setIsOpen(false);
    router.refresh();
  }

  function moveToNext(nextCompletedIds: Set<string>, nextSkippedIds = skippedIds) {
    const nextTransaction = sessionTransactions.find(
      (transaction) => !nextCompletedIds.has(transaction.id)
    );

    setCompletedIds(nextCompletedIds);
    setSkippedIds(nextSkippedIds);
    setCurrentTransaction(nextTransaction);
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

    if (draft.budgetGroupId === CREATE_BUDGET_GROUP_VALUE && !draft.budgetGroupName.trim()) {
      setError('Enter a name for the new budget group.');
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
        budget_group_id:
          draft.budgetGroupId && draft.budgetGroupId !== CREATE_BUDGET_GROUP_VALUE
            ? draft.budgetGroupId
            : null,
        budget_group_name:
          draft.budgetGroupId === CREATE_BUDGET_GROUP_VALUE ? draft.budgetGroupName : null,
        category_id: draft.isSplit ? null : draft.categoryId || null,
        notes: draft.isSplit ? null : draft.notes,
        tag_ids: draft.isSplit ? [] : draft.tagIds,
        tag_names: draft.isSplit ? [] : draft.tagNames,
        splits: splitPayload,
      }),
    });
    const data = (await response.json()) as {
      budget_group?: Pick<BudgetTransactionGroup, 'id' | 'name'> | null;
      error?: string;
      tags?: Pick<Tag, 'id' | 'name' | 'color'>[];
    };

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

    if (data.budget_group) {
      setBudgetGroupOptions((currentGroups) => {
        const groupById = new Map(currentGroups.map((group) => [group.id, group]));
        groupById.set(data.budget_group!.id, data.budget_group!);
        return Array.from(groupById.values()).sort((left, right) => left.name.localeCompare(right.name));
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

  function completeCurrentAfterPaymentLink(counterpartTransactionId: string) {
    if (!currentTransaction) {
      return;
    }

    const nextCompletedIds = new Set(completedIds);
    nextCompletedIds.add(currentTransaction.id);
    nextCompletedIds.add(counterpartTransactionId);
    moveToNext(nextCompletedIds);
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
    setCurrentTransaction(skippedTransaction);
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
                  <Stack spacing={0.25} alignItems="flex-end">
                    <Typography
                      variant="h6"
                      color={currentTransaction.amount_cents < 0 ? 'success.main' : 'text.primary'}
                    >
                      {formatCurrency(Math.abs(currentTransaction.amount_cents))}
                    </Typography>
                    <Chip
                      size="small"
                      color={currentTransaction.amount_cents < 0 ? 'success' : 'default'}
                      label={currentTransaction.amount_cents < 0 ? 'Credit · money back' : 'Debit · money out'}
                    />
                  </Stack>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                  <Chip size="small" label={currentTransaction.date} />
                  <Chip size="small" label={currentTransaction.accounts?.name ?? 'Account'} />
                  <Chip size="small" label={currentTransaction.pending ? 'Pending' : 'Posted'} />
                </Stack>
              </Box>

              <CreditCardPaymentLinkButton
                transactionId={currentTransaction.id}
                link={currentTransaction.credit_card_payment_link ?? null}
                eligible={
                  !currentTransaction.pending &&
                  ((currentTransaction.accounts?.type === 'depository' && currentTransaction.amount_cents > 0) ||
                    (currentTransaction.accounts?.type === 'credit' && currentTransaction.amount_cents < 0))
                }
                onLinked={completeCurrentAfterPaymentLink}
              />

              <FunMoneyAllocationButton
                transactionId={currentTransaction.id}
                transactionDate={currentTransaction.date}
                transactionAmountCents={currentTransaction.amount_cents}
                transactionDescription={currentTransaction.merchant_name ?? currentTransaction.description}
                categories={categories}
                allocations={currentTransaction.fun_money_allocations}
                eligible={
                  !currentTransaction.pending &&
                  currentTransaction.amount_cents < 0 &&
                  !currentTransaction.credit_card_payment_link
                }
              />

              {currentTransaction.amazon_match ? (
                <Box
                  sx={{
                    border: 1,
                    borderColor: currentTransaction.amazon_match.isRefund ? 'success.main' : 'divider',
                    borderRadius: 1,
                    p: 1.5,
                    bgcolor: currentTransaction.amazon_match.isRefund
                      ? 'rgba(46, 125, 50, 0.06)'
                      : 'rgba(109, 255, 46, 0.05)',
                  }}
                >
                  <Stack spacing={1.25}>
                    {currentTransaction.amazon_match.isRefund ? (
                      <Alert severity="success" variant="filled">
                        <Typography variant="subtitle2">Refund credit — not a purchase</Typography>
                        <Typography variant="body2">
                          Amazon links refunds to the original order. Order totals and items below are reference
                          details for identifying what was returned; they are not a new debit.
                        </Typography>
                      </Alert>
                    ) : null}

                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                      <Box>
                        <Typography variant="subtitle2">
                          {currentTransaction.amazon_match.isRefund ? 'Amazon refund match' : 'Amazon purchase match'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Order #{currentTransaction.amazon_match.orderId}
                          {currentTransaction.amazon_match.transactionDate
                            ? ` - ${currentTransaction.amazon_match.transactionDate}`
                            : ''}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          size="small"
                          color={currentTransaction.amazon_match.isRefund ? 'success' : 'default'}
                          label={`${currentTransaction.amazon_match.isRefund ? 'Refund credit' : 'Purchase debit'} ${formatCurrency(
                            Math.abs(currentTransaction.amazon_match.amountCents)
                          )}`}
                        />
                        {currentTransaction.amazon_match.order?.orderDetailUrl ? (
                          <Button
                            component="a"
                            href={currentTransaction.amazon_match.order.orderDetailUrl}
                            target="_blank"
                            rel="noreferrer"
                            size="small"
                            endIcon={<OpenInNewIcon fontSize="small" />}
                          >
                            {currentTransaction.amazon_match.isRefund ? 'Original order' : 'Order'}
                          </Button>
                        ) : null}
                      </Stack>
                    </Stack>

                    {currentTransaction.amazon_match.order ? (
                      <Stack spacing={0.5}>
                        {currentTransaction.amazon_match.isRefund ? (
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                            Original order totals (reference only)
                          </Typography>
                        ) : null}
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          {amazonDisplayItemSubtotalCents !== null ? (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`Items ${formatCurrency(amazonDisplayItemSubtotalCents)}`}
                            />
                          ) : null}
                          {currentTransaction.amazon_match.order.shippingCents !== null ? (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`Shipping ${formatCurrency(currentTransaction.amazon_match.order.shippingCents)}`}
                            />
                          ) : null}
                          {amazonDisplayDiscountsCents !== null ? (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`Discounts ${formatCurrency(amazonDisplayDiscountsCents)}`}
                            />
                          ) : null}
                          {amazonBeforeTaxCents !== null ? (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`Before tax ${formatCurrency(amazonBeforeTaxCents)}`}
                            />
                          ) : null}
                          {amazonDisplayTaxCents !== null ? (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`Estimated tax ${formatCurrency(amazonDisplayTaxCents)}`}
                            />
                          ) : null}
                          {currentTransaction.amazon_match.order.grandTotalCents !== null ? (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`Order total ${formatCurrency(currentTransaction.amazon_match.order.grandTotalCents)}`}
                            />
                          ) : null}
                        </Stack>
                      </Stack>
                    ) : null}

                    {amazonRefundItemsAmbiguous ? (
                      <Alert severity="warning">
                        Amazon did not identify a unique returned item from the refund amount. The list below is the
                        full original order, not a list of newly purchased items. Confirm the return in Amazon before
                        categorizing it.
                      </Alert>
                    ) : amazonRefundItemsFiltered ? (
                      <Typography variant="body2" color="text.secondary">
                        The likely returned {amazonDisplayItems.length === 1 ? 'item was' : 'items were'} inferred by
                        matching the refund amount after tax and discounts.
                      </Typography>
                    ) : null}

                    {amazonDisplayItems.length > 0 ? (
                      <Stack spacing={0.75}>
                        {currentTransaction.amazon_match.isRefund ? (
                          <Typography variant="subtitle2">
                            {amazonRefundItemMatchFound
                              ? `Likely returned ${amazonDisplayItems.length === 1 ? 'item' : 'items'}`
                              : 'Original order items (reference only)'}
                          </Typography>
                        ) : null}
                        {amazonDisplayItems.map((item) => {
                          const itemTotalCents = getAmazonItemTotalCents(item.priceCents, item.quantity);
                          return (
                            <Box
                              key={item.id}
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' },
                                gap: 1,
                                alignItems: 'start',
                              }}
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {item.title}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {item.asin ?? 'No ASIN'}
                                  {item.quantity && item.quantity > 1 ? ` - Qty ${item.quantity}` : ''}
                                </Typography>
                              </Box>
                              <Typography variant="body2" sx={{ whiteSpace: 'nowrap', textAlign: { sm: 'right' } }}>
                                {itemTotalCents === null
                                  ? '-'
                                  : item.quantity && item.quantity > 1
                                    ? `${formatCurrency(item.priceCents ?? 0)} x ${item.quantity} = ${formatCurrency(
                                        itemTotalCents
                                      )}`
                                    : formatCurrency(itemTotalCents)}
                              </Typography>
                            </Box>
                          );
                        })}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No Amazon item rows imported for this order yet.
                      </Typography>
                    )}

                    {amazonSplitDrafts.length > 0 ? (
                      <Box>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<PlaylistAddCheckIcon />}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              isSplit: true,
                              splits: amazonSplitDrafts,
                            }))
                          }
                        >
                          Use items as splits
                        </Button>
                      </Box>
                    ) : singleAmazonItem ? (
                      <Box>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              notes: singleAmazonItem.title,
                            }))
                          }
                        >
                          Use item as note
                        </Button>
                      </Box>
                    ) : null}
                  </Stack>
                </Box>
              ) : null}

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

                    <Box>
                      <Select
                        size="small"
                        fullWidth
                        displayEmpty
                        value={draft.budgetGroupId}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            budgetGroupId: event.target.value,
                            budgetGroupName:
                              event.target.value === CREATE_BUDGET_GROUP_VALUE
                                ? current.budgetGroupName
                                : '',
                          }))
                        }
                      >
                        <MenuItem value="">No budget group</MenuItem>
                        {budgetGroupOptions.map((group) => (
                          <MenuItem key={group.id} value={group.id}>
                            {group.name}
                          </MenuItem>
                        ))}
                        <Divider />
                        <MenuItem value={CREATE_BUDGET_GROUP_VALUE}>Create a new budget group…</MenuItem>
                      </Select>
                      <Typography variant="caption" color="text.secondary">
                        Linked transactions share one cell in the monthly budget.
                      </Typography>
                    </Box>

                    {draft.budgetGroupId === CREATE_BUDGET_GROUP_VALUE ? (
                      <TextField
                        size="small"
                        fullWidth
                        autoFocus
                        label="New budget group name"
                        value={draft.budgetGroupName}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, budgetGroupName: event.target.value }))
                        }
                        inputProps={{ maxLength: 80 }}
                      />
                    ) : null}

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
