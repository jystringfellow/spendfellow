import { redirect } from 'next/navigation';
import {
  Box,
  Button,
  Container,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import CategorizationModeButton from '@/components/transactions/CategorizationModeButton';
import TransactionsTable, { AmazonTransactionMatch, EditableTransactionRow } from '@/components/transactions/TransactionsTable';
import ManualTransactionDialog, { type ManualTransactionAccountOption } from '@/components/transactions/ManualTransactionDialog';
import type { CreditCardPaymentLinkSummary } from '@/components/transactions/CreditCardPaymentLinkButton';
import type { FunMoneyAllocationSummary } from '@/components/transactions/FunMoneyAllocationButton';
import { getCurrentHousehold } from '@/lib/households';
import { matchAmazonPaymentsToTransactions } from '@/lib/amazonTransactionMatching';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type {
  AmazonOrder,
  AmazonOrderItem,
  AmazonPaymentTransaction,
  BudgetTransactionGroup,
  BudgetTransactionGroupMember,
  Category,
  Tag,
  TransactionBudgetExclusion,
  TransactionTag,
} from '@/types/database';

const PAGE_SIZE = 50;
const SORT_COLUMNS = ['date', 'amount_cents', 'merchant_name', 'description'] as const;

interface TransactionsPageProps {
  searchParams?: {
    accountId?: string;
    categoryId?: string;
    dir?: string;
    from?: string;
    page?: string;
    q?: string;
    sort?: string;
    to?: string;
  };
}

function getSelectedPage(pageParam: string | undefined) {
  const parsedPage = Number(pageParam);
  return Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
}

function getSortColumn(sortParam: string | undefined): (typeof SORT_COLUMNS)[number] {
  return SORT_COLUMNS.includes(sortParam as (typeof SORT_COLUMNS)[number])
    ? (sortParam as (typeof SORT_COLUMNS)[number])
    : 'date';
}

function getSortDirection(dirParam: string | undefined): 'asc' | 'desc' {
  return dirParam === 'asc' ? 'asc' : 'desc';
}

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getSearchText(value: string | undefined) {
  return value?.replace(/[%,]/g, ' ').trim() ?? '';
}

function buildTransactionsHref(
  currentParams: TransactionsPageProps['searchParams'],
  updates: Record<string, string | number | null>
) {
  const params = new URLSearchParams();
  Object.entries(currentParams ?? {}).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === '') {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  });
  const queryString = params.toString();
  return queryString ? `/transactions?${queryString}` : '/transactions';
}

function addDays(date: string, days: number) {
  const parsedDate = new Date(`${date}T00:00:00`);
  parsedDate.setDate(parsedDate.getDate() + days);
  return parsedDate.toISOString().slice(0, 10);
}

function getAmazonMatchAmountCandidates(amountCents: number) {
  return Array.from(new Set([amountCents, -amountCents]));
}

function createAmazonMatch(
  payment: AmazonPaymentTransaction,
  orderById: Map<string, AmazonOrder>,
  itemsByOrderId: Map<string, AmazonOrderItem[]>
): AmazonTransactionMatch {
  const order = orderById.get(payment.order_id) ?? null;
  return {
    paymentTransactionId: payment.id,
    orderId: payment.order_id,
    transactionDate: payment.transaction_date,
    amountCents: payment.amount_cents,
    merchantText: payment.merchant_text,
    isRefund: payment.is_refund,
    order: order
      ? {
          orderDetailUrl: order.order_detail_url,
          itemSubtotalCents: order.item_subtotal_cents,
          shippingCents: order.shipping_cents,
          discountsCents: order.discounts_cents,
          taxCents: order.tax_cents,
          grandTotalCents: order.grand_total_cents,
        }
      : null,
    items: (itemsByOrderId.get(payment.order_id) ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      priceCents: item.price_cents,
      asin: item.asin,
      quantity: item.quantity,
      sortOrder: item.sort_order,
    })),
  };
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getCurrentHousehold(supabase);
  const selectedPage = getSelectedPage(searchParams?.page);
  const sortColumn = getSortColumn(searchParams?.sort);
  const sortDirection = getSortDirection(searchParams?.dir);
  const searchText = getSearchText(searchParams?.q);
  const fromDate = isIsoDate(searchParams?.from) ? searchParams?.from : '';
  const toDate = isIsoDate(searchParams?.to) ? searchParams?.to : '';
  const selectedAccountId = searchParams?.accountId ?? '';
  const selectedCategoryId = searchParams?.categoryId ?? '';

  let transactionsQuery = household
    ? supabase
        .from('transactions')
        .select('*, accounts(name, type, source)', { count: 'exact' })
        .eq('household_id', household.id)
    : null;

  if (transactionsQuery && searchText) {
    transactionsQuery = transactionsQuery.or(`merchant_name.ilike.%${searchText}%,description.ilike.%${searchText}%`);
  }
  if (transactionsQuery && selectedAccountId) {
    transactionsQuery = transactionsQuery.eq('account_id', selectedAccountId);
  }
  if (transactionsQuery && selectedCategoryId === 'uncategorized') {
    transactionsQuery = transactionsQuery.is('category_id', null);
  } else if (transactionsQuery && selectedCategoryId) {
    transactionsQuery = transactionsQuery.eq('category_id', selectedCategoryId);
  }
  if (transactionsQuery && fromDate) {
    transactionsQuery = transactionsQuery.gte('date', fromDate);
  }
  if (transactionsQuery && toDate) {
    transactionsQuery = transactionsQuery.lte('date', toDate);
  }

  const rangeFrom = (selectedPage - 1) * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;
  const pagedTransactionsQuery = transactionsQuery
    ?.order(sortColumn, { ascending: sortDirection === 'asc', nullsFirst: false })
    .order('id', { ascending: true })
    .range(rangeFrom, rangeTo);

  const [
    transactionResult,
    { data: uncategorizedRows },
    { data: categoryRows },
    { data: tagRows },
    { data: accountRows },
    { data: budgetGroupRows },
  ] = household
    ? await Promise.all([
        pagedTransactionsQuery ?? Promise.resolve({ data: [], count: 0 }),
        supabase
          .from('transactions')
          .select('*, accounts(name, type, source)')
          .eq('household_id', household.id)
          .is('category_id', null)
          .order('date', { ascending: true }),
        supabase
          .from('categories')
          .select('id, name, is_income, rollover_enabled, rollover_start_date')
          .eq('household_id', household.id)
          .eq('is_group', false)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        supabase.from('tags').select('id, name, color').eq('household_id', household.id).order('name'),
        supabase.from('accounts').select('id, name, type, source').eq('household_id', household.id).eq('is_active', true).order('name'),
        supabase
          .from('budget_transaction_groups')
          .select('*')
          .eq('household_id', household.id)
          .order('name', { ascending: true }),
      ])
    : [
        { data: [], count: 0 },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
      ];
  const transactionRows = transactionResult.data ?? [];
  const totalTransactionCount = transactionResult.count ?? transactionRows.length;
  const totalPages = Math.max(1, Math.ceil(totalTransactionCount / PAGE_SIZE));
  const transactionIds = [
    ...(transactionRows ?? []).map((transaction) => transaction.id),
    ...(uncategorizedRows ?? []).map((transaction) => transaction.id),
  ];
  const { data: transactionTagRows } =
    household && transactionIds.length > 0
      ? await supabase.from('transaction_tags').select('transaction_id, tag_id').in('transaction_id', transactionIds)
      : { data: [] };
  const { data: transactionSplitRows } =
    household && transactionIds.length > 0
      ? await supabase.from('transaction_splits').select('transaction_id').in('transaction_id', transactionIds)
      : { data: [] };
  const tagIdsByTransactionId = new Map<string, string[]>();
  ((transactionTagRows ?? []) as TransactionTag[]).forEach((transactionTag) => {
    const currentTagIds = tagIdsByTransactionId.get(transactionTag.transaction_id) ?? [];
    tagIdsByTransactionId.set(transactionTag.transaction_id, [...currentTagIds, transactionTag.tag_id]);
  });
  const splitCountByTransactionId = new Map<string, number>();
  (transactionSplitRows ?? []).forEach((transactionSplit) => {
    splitCountByTransactionId.set(
      transactionSplit.transaction_id,
      (splitCountByTransactionId.get(transactionSplit.transaction_id) ?? 0) + 1
    );
  });
  const transactions = (transactionRows ?? []).map((transaction) => ({
    ...transaction,
    transaction_tag_ids: tagIdsByTransactionId.get(transaction.id) ?? [],
    transaction_split_count: splitCountByTransactionId.get(transaction.id) ?? 0,
    fun_money_allocations: [],
  })) as EditableTransactionRow[];
  const uncategorizedTransactions = (uncategorizedRows ?? [])
    .map((transaction) => ({
      ...transaction,
      transaction_tag_ids: tagIdsByTransactionId.get(transaction.id) ?? [],
      transaction_split_count: splitCountByTransactionId.get(transaction.id) ?? 0,
      fun_money_allocations: [],
    }))
    .filter((transaction) => transaction.transaction_split_count === 0) as EditableTransactionRow[];
  const categories = (categoryRows ?? []) as Pick<
    Category,
    'id' | 'name' | 'is_income' | 'rollover_enabled' | 'rollover_start_date'
  >[];
  const tags = (tagRows ?? []) as Pick<Tag, 'id' | 'name' | 'color'>[];
  const accountOptions = (accountRows ?? []) as ManualTransactionAccountOption[];
  const resultStart = totalTransactionCount === 0 ? 0 : rangeFrom + 1;
  const resultEnd = Math.min(totalTransactionCount, rangeFrom + transactions.length);

  const loadedTransactionIds = Array.from(
    new Set([...transactions.map((transaction) => transaction.id), ...uncategorizedTransactions.map((transaction) => transaction.id)])
  );
  const budgetGroups = (budgetGroupRows ?? []) as BudgetTransactionGroup[];
  const { data: budgetGroupMemberRows } =
    household && loadedTransactionIds.length > 0
      ? await supabase
          .from('budget_transaction_group_members')
          .select('transaction_id, group_id, household_id, created_by, created_at')
          .eq('household_id', household.id)
          .in('transaction_id', loadedTransactionIds)
      : { data: [] };
  const budgetGroupById = new Map(budgetGroups.map((group) => [group.id, group]));
  const budgetGroupIdByTransactionId = new Map(
    ((budgetGroupMemberRows ?? []) as BudgetTransactionGroupMember[]).map((member) => [
      member.transaction_id,
      member.group_id,
    ])
  );
  const { data: funMoneyAllocationRows } =
    household && loadedTransactionIds.length > 0
      ? await supabase
          .from('category_balance_adjustments')
          .select('id, category_id, amount_cents, effective_date, description, source_transaction_id')
          .eq('household_id', household.id)
          .in('source_transaction_id', loadedTransactionIds)
          .eq('status', 'posted')
      : { data: [] };
  const funMoneyAllocationsByTransactionId = new Map<string, FunMoneyAllocationSummary[]>();
  (
    (funMoneyAllocationRows ?? []) as Array<
      FunMoneyAllocationSummary & { source_transaction_id: string }
    >
  ).forEach((allocation) => {
    funMoneyAllocationsByTransactionId.set(allocation.source_transaction_id, [
      ...(funMoneyAllocationsByTransactionId.get(allocation.source_transaction_id) ?? []),
      allocation,
    ]);
  });
  const [{ data: paymentLinkRows }, { data: budgetExclusionRows }] =
    household && loadedTransactionIds.length > 0
      ? await Promise.all([
          supabase
            .from('credit_card_payment_links')
            .select('id, checking_transaction_id, credit_transaction_id')
            .eq('household_id', household.id)
            .or(
              `checking_transaction_id.in.(${loadedTransactionIds.join(',')}),credit_transaction_id.in.(${loadedTransactionIds.join(',')})`
            ),
          supabase
            .from('transaction_budget_exclusions')
            .select('transaction_id, household_id, reason, created_by, created_at')
            .eq('household_id', household.id)
            .in('transaction_id', loadedTransactionIds),
        ])
      : [{ data: [] }, { data: [] }];
  const paymentLinks = (paymentLinkRows ?? []) as Array<{
    id: string;
    checking_transaction_id: string;
    credit_transaction_id: string;
  }>;
  const linkedTransactionIds = Array.from(
    new Set(paymentLinks.flatMap((link) => [link.checking_transaction_id, link.credit_transaction_id]))
  );
  const { data: linkedTransactionRows } =
    household && linkedTransactionIds.length > 0
      ? await supabase
          .from('transactions')
          .select('id, date, amount_cents, description, merchant_name, accounts(name)')
          .eq('household_id', household.id)
          .in('id', linkedTransactionIds)
      : { data: [] };
  const linkedTransactionById = new Map(
    ((linkedTransactionRows ?? []) as unknown as Array<{
      id: string;
      date: string;
      amount_cents: number;
      description: string;
      merchant_name: string | null;
      accounts: { name: string } | null;
    }>).map((transaction) => [transaction.id, transaction])
  );
  const paymentLinkByTransactionId = new Map<string, CreditCardPaymentLinkSummary>();
  const budgetExclusionByTransactionId = new Map(
    ((budgetExclusionRows ?? []) as TransactionBudgetExclusion[]).map((exclusion) => [
      exclusion.transaction_id,
      exclusion,
    ])
  );
  paymentLinks.forEach((link) => {
    const checkingTransaction = linkedTransactionById.get(link.checking_transaction_id);
    const creditTransaction = linkedTransactionById.get(link.credit_transaction_id);
    if (!checkingTransaction || !creditTransaction) {
      return;
    }

    paymentLinkByTransactionId.set(link.checking_transaction_id, {
      id: link.id,
      counterpart: {
        ...creditTransaction,
        account_name: creditTransaction.accounts?.name ?? 'Unknown account',
      },
    });
    paymentLinkByTransactionId.set(link.credit_transaction_id, {
      id: link.id,
      counterpart: {
        ...checkingTransaction,
        account_name: checkingTransaction.accounts?.name ?? 'Unknown account',
      },
    });
  });
  const transactionsWithPaymentMetadata = transactions.map((transaction) => ({
    ...transaction,
    budget_group: budgetGroupById.get(budgetGroupIdByTransactionId.get(transaction.id) ?? '') ?? null,
    credit_card_payment_link: paymentLinkByTransactionId.get(transaction.id) ?? null,
    budget_exclusion: budgetExclusionByTransactionId.get(transaction.id) ?? null,
    fun_money_allocations: funMoneyAllocationsByTransactionId.get(transaction.id) ?? [],
  }));
  const uncategorizedTransactionsWithoutPayments = uncategorizedTransactions
    .map((transaction) => ({
      ...transaction,
      budget_group: budgetGroupById.get(budgetGroupIdByTransactionId.get(transaction.id) ?? '') ?? null,
      credit_card_payment_link: paymentLinkByTransactionId.get(transaction.id) ?? null,
      budget_exclusion: budgetExclusionByTransactionId.get(transaction.id) ?? null,
      fun_money_allocations: funMoneyAllocationsByTransactionId.get(transaction.id) ?? [],
    }))
    .filter(
      (transaction) =>
        !paymentLinkByTransactionId.has(transaction.id) &&
        !budgetExclusionByTransactionId.has(transaction.id)
    );

  const amazonMatchByTransactionId = new Map<string, AmazonTransactionMatch>();
  if (household && uncategorizedTransactionsWithoutPayments.length > 0) {
    const dates = uncategorizedTransactionsWithoutPayments.map((transaction) => transaction.date).sort();
    const amountCandidates = Array.from(
      new Set(
        uncategorizedTransactionsWithoutPayments.flatMap((transaction) =>
          getAmazonMatchAmountCandidates(transaction.amount_cents)
        )
      )
    );
    const startDate = addDays(dates[0], -5);
    const endDate = addDays(dates[dates.length - 1], 5);
    const { data: amazonPaymentRows } =
      amountCandidates.length > 0
        ? await supabase
            .from('amazon_payment_transactions')
            .select('*')
            .eq('household_id', household.id)
            .in('amount_cents', amountCandidates)
            .gte('transaction_date', startDate)
            .lte('transaction_date', endDate)
        : { data: [] };
    const amazonPayments = (amazonPaymentRows ?? []) as AmazonPaymentTransaction[];
    const orderIds = Array.from(new Set(amazonPayments.map((payment) => payment.order_id)));
    const [{ data: amazonOrderRows }, { data: amazonItemRows }] =
      orderIds.length > 0
        ? await Promise.all([
            supabase.from('amazon_orders').select('*').eq('household_id', household.id).in('order_id', orderIds),
            supabase
              .from('amazon_order_items')
              .select('*')
              .eq('household_id', household.id)
              .in('order_id', orderIds)
              .order('sort_order', { ascending: true }),
          ])
        : [{ data: [] }, { data: [] }];
    const orderById = new Map(((amazonOrderRows ?? []) as AmazonOrder[]).map((order) => [order.order_id, order]));
    const itemsByOrderId = new Map<string, AmazonOrderItem[]>();
    ((amazonItemRows ?? []) as AmazonOrderItem[]).forEach((item) => {
      itemsByOrderId.set(item.order_id, [...(itemsByOrderId.get(item.order_id) ?? []), item]);
    });

    const paymentIdByTransactionId = matchAmazonPaymentsToTransactions(
      uncategorizedTransactionsWithoutPayments.map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        amountCents: transaction.amount_cents,
      })),
      amazonPayments.map((payment) => ({
        id: payment.id,
        transactionDate: payment.transaction_date,
        amountCents: payment.amount_cents,
        isRefund: payment.is_refund,
        plaidTransactionId: payment.plaid_transaction_id,
      }))
    );
    const paymentById = new Map(amazonPayments.map((payment) => [payment.id, payment]));

    uncategorizedTransactionsWithoutPayments.forEach((transaction) => {
      const match = paymentById.get(paymentIdByTransactionId.get(transaction.id) ?? '');
      if (match) {
        amazonMatchByTransactionId.set(transaction.id, createAmazonMatch(match, orderById, itemsByOrderId));
      }
    });
  }

  const uncategorizedTransactionsWithAmazonMatches = uncategorizedTransactionsWithoutPayments.map((transaction) => ({
    ...transaction,
    amazon_match: amazonMatchByTransactionId.get(transaction.id) ?? null,
  }));

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              Transactions
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Review uncategorized spend before it rolls into budget views.
            </Typography>
          </Box>
          {household ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
              <ManualTransactionDialog accounts={accountOptions} categories={categories} />
              <CategorizationModeButton
                transactions={uncategorizedTransactionsWithAmazonMatches}
                categories={categories}
                tags={tags}
                budgetGroups={budgetGroups}
              />
            </Stack>
          ) : null}
        </Stack>

        <Paper sx={{ p: 0, overflow: 'hidden' }}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6">Latest transactions</Typography>
            <Typography variant="body2" color="text.secondary">
              Showing {resultStart}-{resultEnd} of {totalTransactionCount} transactions. Save changes per row as you
              categorize and annotate.
            </Typography>
            <Box component="form" action="/transactions" method="get" sx={{ mt: 2 }}>
              <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', lg: 'center' }}>
                <TextField size="small" name="q" label="Search" defaultValue={searchText} />
                <TextField size="small" name="from" label="From" type="date" defaultValue={fromDate} InputLabelProps={{ shrink: true }} />
                <TextField size="small" name="to" label="To" type="date" defaultValue={toDate} InputLabelProps={{ shrink: true }} />
                <TextField size="small" select name="accountId" label="Account" defaultValue={selectedAccountId} sx={{ minWidth: 180 }}>
                  <MenuItem value="">All accounts</MenuItem>
                  {accountOptions.map((account) => (
                    <MenuItem key={account.id} value={account.id}>
                      {account.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField size="small" select name="categoryId" label="Category" defaultValue={selectedCategoryId} sx={{ minWidth: 190 }}>
                  <MenuItem value="">All categories</MenuItem>
                  <MenuItem value="uncategorized">Uncategorized</MenuItem>
                  {categories.map((category) => (
                    <MenuItem key={category.id} value={category.id}>
                      {category.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField size="small" select name="sort" label="Sort" defaultValue={sortColumn} sx={{ minWidth: 150 }}>
                  <MenuItem value="date">Date</MenuItem>
                  <MenuItem value="amount_cents">Amount</MenuItem>
                  <MenuItem value="merchant_name">Merchant</MenuItem>
                  <MenuItem value="description">Description</MenuItem>
                </TextField>
                <TextField size="small" select name="dir" label="Direction" defaultValue={sortDirection} sx={{ minWidth: 130 }}>
                  <MenuItem value="desc">Desc</MenuItem>
                  <MenuItem value="asc">Asc</MenuItem>
                </TextField>
                <Button type="submit" variant="contained">
                  Apply
                </Button>
                <Button component={Link} href="/transactions" variant="outlined">
                  Reset
                </Button>
              </Stack>
            </Box>
          </Box>
          <Divider />
          {transactions.length > 0 ? (
            <>
              <TransactionsTable
                transactions={transactionsWithPaymentMetadata}
                categories={categories}
                tags={tags}
                accounts={accountOptions}
                budgetGroups={budgetGroups}
              />
              <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" sx={{ p: 2 }}>
                <Button
                  component={Link}
                  href={buildTransactionsHref(searchParams, { page: Math.max(1, selectedPage - 1) })}
                  variant="outlined"
                  disabled={selectedPage <= 1}
                >
                  Previous
                </Button>
                <Typography variant="body2" color="text.secondary">
                  Page {selectedPage} of {totalPages}
                </Typography>
                <Button
                  component={Link}
                  href={buildTransactionsHref(searchParams, { page: Math.min(totalPages, selectedPage + 1) })}
                  variant="outlined"
                  disabled={selectedPage >= totalPages}
                >
                  Next
                </Button>
              </Stack>
            </>
          ) : (
            <Box sx={{ p: 3 }}>
              <Typography color="text.secondary">No transactions synced yet.</Typography>
            </Box>
          )}
        </Paper>
      </Box>
    </Container>
  );
}
