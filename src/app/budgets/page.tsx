import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Fragment } from 'react';
import {
  Box,
  Button,
  Chip,
  Container,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { getAccountBalanceCategory } from '@/lib/accountBalanceCategories';
import { getCurrentHousehold } from '@/lib/households';
import { formatCurrency } from '@/lib/money';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type {
  Account,
  AccountBalanceSnapshot,
  BudgetActualLine,
  Category,
  MonthlySpending,
  Tag,
  Transaction,
  TransactionSplitTag,
  TransactionTag,
} from '@/types/database';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'] as const;
const MONTH_SLUGS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;
const MONTHLY_MIN_ROWS = 18;

interface BudgetsPageProps {
  searchParams?: {
    year?: string;
    sheet?: string;
  };
}

interface MonthlyDetailLine extends BudgetActualLine {
  description: string;
  merchant_name: string | null;
  tags: Pick<Tag, 'id' | 'name' | 'color'>[];
}

interface CategorySection {
  id: string;
  name: string;
  color: string;
  headerColor: string;
  role: 'expense' | 'income' | 'savings';
  categories: Category[];
}

interface BalanceSummary {
  key: 'checking' | 'savings' | 'ccDebt' | 'investments';
  label: string;
  balanceCents: number;
}

const TAG_FONT_COLOR_RULES = [
  { name: 'Gifts', color: '#9900ff' },
  { name: 'Venmo', color: '#0000ff' },
  { name: 'HSA', color: '#ff00ff' },
  { name: 'Cash', color: '#38761d' },
];

function getSelectedYear(yearParam: string | undefined): number {
  const parsedYear = Number(yearParam);
  if (Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100) {
    return parsedYear;
  }

  return new Date().getFullYear();
}

function getSelectedSheet(sheetParam: string | undefined): string {
  if (sheetParam === 'summary') {
    return 'summary';
  }

  if (sheetParam && MONTH_SLUGS.includes(sheetParam as (typeof MONTH_SLUGS)[number])) {
    return sheetParam;
  }

  return MONTH_SLUGS[new Date().getMonth()] ?? 'jan';
}

function getSelectedMonth(sheet: string): number {
  const monthIndex = MONTH_SLUGS.findIndex((monthSlug) => monthSlug === sheet);
  return monthIndex >= 0 ? monthIndex + 1 : new Date().getMonth() + 1;
}

function getMonthDateRange(year: number, month: number): { startDate: string; endDate: string } {
  const daysInMonth = new Date(year, month, 0).getDate();
  const paddedMonth = String(month).padStart(2, '0');

  return {
    startDate: `${year}-${paddedMonth}-01`,
    endDate: `${year}-${paddedMonth}-${String(daysInMonth).padStart(2, '0')}`,
  };
}

function getActualCents(spendingByCategoryMonth: Map<string, number>, categoryId: string, month: number): number {
  return spendingByCategoryMonth.get(`${categoryId}:${month}`) ?? 0;
}

function getDisplayActualCents(cents: number): number {
  return Math.abs(cents);
}

function getYearRowTotal(spendingByCategoryMonth: Map<string, number>, categoryId: string): number {
  return MONTHS.reduce(
    (total, _monthName, monthIndex) => total + getActualCents(spendingByCategoryMonth, categoryId, monthIndex + 1),
    0
  );
}

function getCategorySections(categories: Category[]): CategorySection[] {
  const groups = categories.filter((category) => category.is_group);
  const childCategories = categories.filter((category) => !category.is_group);
  const palette = [
    { color: '#c9daf8', headerColor: '#9fc5e8' },
    { color: '#fce5cd', headerColor: '#f9cb9c' },
    { color: '#ead1dc', headerColor: '#d5a6bd' },
    { color: '#d9ead3', headerColor: '#b6d7a8' },
    { color: '#fff2cc', headerColor: '#ffe599' },
    { color: '#d9d2e9', headerColor: '#b4a7d6' },
  ];

  const sections = groups
    .map((group, index) => ({
      id: group.id,
      name: group.name,
      ...palette[index % palette.length],
      role: getSectionRole(group),
      categories: childCategories.filter((category) => category.parent_category_id === group.id),
    }))
    .filter((section) => section.categories.length > 0);

  const orphanCategories = childCategories.filter((category) => !category.parent_category_id);
  if (orphanCategories.length > 0) {
    sections.push({
      id: 'other',
      name: 'Other',
      color: '#eeeeee',
      headerColor: '#d9d9d9',
      role: 'expense',
      categories: orphanCategories,
    });
  }

  return sections;
}

function getSectionRole(sectionOrCategory: Pick<Category, 'name' | 'group_key' | 'is_income'>): CategorySection['role'] {
  const name = sectionOrCategory.name.toLowerCase();
  const groupKey = sectionOrCategory.group_key?.toLowerCase();

  if (sectionOrCategory.is_income || groupKey === 'income' || name.includes('income')) {
    return 'income';
  }

  if (groupKey === 'savings' || name.includes('savings')) {
    return 'savings';
  }

  return 'expense';
}

function getMonthlyLineTitle(line: MonthlyDetailLine): string {
  return line.merchant_name ?? line.description;
}

function getMonthlyLineTooltip(line: MonthlyDetailLine): string {
  const note = line.notes?.trim();
  const title = getMonthlyLineTitle(line);
  const tags = line.tags.length ? `Tags: ${line.tags.map((tag) => tag.name).join(', ')}` : null;
  const base = [title, line.date, tags].filter(Boolean).join('\n');

  return note ? `${base}\n${note}` : base;
}

function getLineFontColor(line: MonthlyDetailLine): string {
  const colorOverride = line.tags.find((tag) => tag.color)?.color;

  if (colorOverride) {
    return colorOverride;
  }

  for (const rule of TAG_FONT_COLOR_RULES) {
    if (line.tags.some((tag) => tag.name.toLowerCase() === rule.name.toLowerCase())) {
      return rule.color;
    }
  }

  return '#000';
}

function formatSheetExpense(cents: number): string {
  if (!cents) {
    return '$0.00';
  }

  return formatCurrency(-Math.abs(cents));
}

function formatSheetAmount(cents: number, role: CategorySection['role'] = 'expense'): string {
  if (role === 'expense') {
    return formatSheetExpense(cents);
  }

  return formatCurrency(Math.abs(cents));
}

function formatSheetTotal(cents: number): string {
  if (!cents) {
    return '$0.00';
  }

  return cents < 0 ? formatCurrency(cents) : formatCurrency(cents);
}

function getCategoryMonthTotal(spendingByCategoryMonth: Map<string, number>, category: Category, month: number): number {
  return getActualCents(spendingByCategoryMonth, category.id, month);
}

function getSectionMonthTotal(section: CategorySection, spendingByCategoryMonth: Map<string, number>, month: number): number {
  return section.categories.reduce(
    (total, category) =>
      total + getDisplayActualCents(getCategoryMonthTotal(spendingByCategoryMonth, category, month)),
    0
  );
}

function getSectionYearTotal(section: CategorySection, spendingByCategoryMonth: Map<string, number>): number {
  return MONTHS.reduce(
    (total, _monthName, monthIndex) => total + getSectionMonthTotal(section, spendingByCategoryMonth, monthIndex + 1),
    0
  );
}

function getMonthlySectionTotal(section: CategorySection, monthlyLinesByCategoryId: Map<string, MonthlyDetailLine[]>): number {
  return section.categories.reduce(
    (total, category) =>
      total +
      (monthlyLinesByCategoryId.get(category.id) ?? []).reduce(
        (categoryTotal, line) => categoryTotal + getDisplayActualCents(line.amount_cents),
        0
      ),
    0
  );
}

function formatSheetVariance(cents: number): string {
  return formatCurrency(cents);
}

function formatSavingsRate(savingsCents: number, incomeCents: number): string {
  return incomeCents ? `${((savingsCents / incomeCents) * 100).toFixed(2)}%` : 'No Income';
}

function getNonZeroAverage(values: number[]): number {
  const nonZeroValues = values.filter((value) => value !== 0);

  return Math.round(nonZeroValues.reduce((sum, value) => sum + value, 0) / Math.max(1, nonZeroValues.length));
}

function getAverageIncomePercentage(amountTotals: number[], incomeTotals: number[]): string {
  const rates = amountTotals
    .map((amountTotal, monthIndex) => {
      const incomeTotal = incomeTotals[monthIndex] ?? 0;
      return incomeTotal ? amountTotal / incomeTotal : null;
    })
    .filter((rate): rate is number => rate !== null && rate !== 0);

  if (rates.length === 0) {
    return 'No entries.';
  }

  return `${((rates.reduce((sum, rate) => sum + rate, 0) / rates.length) * 100).toFixed(2)}%`;
}

function formatIncomePercentage(amountCents: number, incomeCents: number): string {
  return incomeCents ? `${((amountCents / incomeCents) * 100).toFixed(2)}%` : 'No entries.';
}

function getCellBorderSx() {
  return {
    border: '1px solid #000',
    px: 0.5,
    py: 0.25,
    height: 22,
    fontFamily: 'Arial, sans-serif',
    fontSize: 12,
    lineHeight: 1.15,
    color: '#000',
  };
}

function getMonthStartDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function getBalanceCents(account: Account, snapshotByAccountId: Map<string, AccountBalanceSnapshot>): number {
  return snapshotByAccountId.get(account.id)?.current_balance_cents ?? account.current_balance_cents ?? 0;
}

function getBalanceSnapshotDistance(snapshot: AccountBalanceSnapshot, targetTime: number): number {
  return Math.abs(new Date(snapshot.recorded_at).getTime() - targetTime);
}

function getClosestBalanceSnapshots(
  snapshots: AccountBalanceSnapshot[],
  targetDate: string
): Map<string, AccountBalanceSnapshot> {
  const targetTime = new Date(`${targetDate}T00:00:00.000Z`).getTime();
  const closestByAccountId = new Map<string, AccountBalanceSnapshot>();

  snapshots.forEach((snapshot) => {
    const current = closestByAccountId.get(snapshot.account_id);
    if (!current || getBalanceSnapshotDistance(snapshot, targetTime) < getBalanceSnapshotDistance(current, targetTime)) {
      closestByAccountId.set(snapshot.account_id, snapshot);
    }
  });

  return closestByAccountId;
}

function sumAccountBalances(
  accounts: Account[],
  snapshotByAccountId: Map<string, AccountBalanceSnapshot>,
  category: BalanceSummary['key'],
  sign: 'asset' | 'debt' = 'asset'
): number {
  const total = accounts
    .filter((account) => account.is_active && getAccountBalanceCategory(account) === category)
    .reduce((sum, account) => sum + Math.abs(getBalanceCents(account, snapshotByAccountId)), 0);

  return sign === 'debt' ? -total : total;
}

function getBalanceSummaries(accounts: Account[], snapshotByAccountId: Map<string, AccountBalanceSnapshot>): BalanceSummary[] {
  return [
    {
      key: 'checking',
      label: 'Checking',
      balanceCents: sumAccountBalances(accounts, snapshotByAccountId, 'checking'),
    },
    {
      key: 'savings',
      label: 'Savings',
      balanceCents: sumAccountBalances(accounts, snapshotByAccountId, 'savings'),
    },
    {
      key: 'ccDebt',
      label: 'CC Debt',
      balanceCents: sumAccountBalances(accounts, snapshotByAccountId, 'ccDebt', 'debt'),
    },
    {
      key: 'investments',
      label: 'Investments',
      balanceCents: sumAccountBalances(accounts, snapshotByAccountId, 'investments'),
    },
  ];
}

export default async function BudgetsPage({ searchParams }: BudgetsPageProps) {
  const selectedYear = getSelectedYear(searchParams?.year);
  const selectedSheet = getSelectedSheet(searchParams?.sheet);
  const selectedMonth = getSelectedMonth(selectedSheet);
  const { startDate, endDate } = getMonthDateRange(selectedYear, selectedMonth);
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getCurrentHousehold(supabase);
  const [
    { data: categoryRows },
    { data: spendingRows },
    { data: monthlyActualRows },
    { data: accountRows },
    { data: balanceSnapshotRows },
  ] = household
    ? await Promise.all([
        supabase
          .from('categories')
          .select('*')
          .eq('household_id', household.id)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        supabase
          .from('monthly_spending_by_category')
          .select('*')
          .eq('household_id', household.id)
          .eq('year', selectedYear),
        supabase
          .from('budget_actual_lines')
          .select('*')
          .eq('household_id', household.id)
          .eq('pending', false)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true }),
        supabase
          .from('accounts')
          .select('*')
          .eq('household_id', household.id)
          .eq('is_active', true)
          .order('name', { ascending: true }),
        supabase
          .from('account_balance_snapshots')
          .select('*')
          .eq('household_id', household.id)
          .order('recorded_at', { ascending: false })
          .limit(2000),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const categories = (categoryRows ?? []) as Category[];
  const accountSummaries = (accountRows ?? []) as Account[];
  const balanceSnapshotByAccountId = getClosestBalanceSnapshots(
    (balanceSnapshotRows ?? []) as AccountBalanceSnapshot[],
    getMonthStartDate(selectedYear, selectedMonth)
  );
  const balanceSummaries = getBalanceSummaries(accountSummaries, balanceSnapshotByAccountId);
  const balanceSummaryTotalCents = balanceSummaries.reduce((total, summary) => total + summary.balanceCents, 0);
  const balanceSummaryCellCount = balanceSummaries.length + 1;
  const spending = (spendingRows ?? []) as MonthlySpending[];
  const sections = getCategorySections(categories);
  const visibleCategories = sections.flatMap((section) => section.categories);
  const expenseSections = sections.filter((section) => section.role === 'expense');
  const incomeSections = sections.filter((section) => section.role === 'income');
  const savingsSections = sections.filter((section) => section.role === 'savings');
  const expenseCategories = expenseSections.flatMap((section) => section.categories);
  const spendingByCategoryMonth = new Map<string, number>();

  spending.forEach((row) => {
    spendingByCategoryMonth.set(`${row.category_id}:${row.month}`, Number(row.total_cents ?? 0));
  });

  const actualLines = ((monthlyActualRows ?? []) as BudgetActualLine[]).filter((line) => Boolean(line.category_id));
  const transactionIds = Array.from(new Set(actualLines.map((line) => line.transaction_id)));
  const { data: monthlyTransactionRows } =
    household && transactionIds.length > 0
      ? await supabase
          .from('transactions')
          .select('id, merchant_name, description')
          .eq('household_id', household.id)
          .in('id', transactionIds)
      : { data: [] };
  const transactionById = new Map(
    ((monthlyTransactionRows ?? []) as Pick<Transaction, 'id' | 'merchant_name' | 'description'>[]).map((transaction) => [
      transaction.id,
      transaction,
    ])
  );
  const monthlySplitIds = actualLines
    .map((line) => line.transaction_split_id)
    .filter((splitId): splitId is string => Boolean(splitId));
  const [{ data: transactionTagRows }, { data: splitTagRows }] = await Promise.all([
    transactionIds.length > 0
      ? supabase.from('transaction_tags').select('transaction_id, tag_id').in('transaction_id', transactionIds)
      : Promise.resolve({ data: [] }),
    monthlySplitIds.length > 0
      ? supabase.from('transaction_split_tags').select('transaction_split_id, tag_id').in('transaction_split_id', monthlySplitIds)
      : Promise.resolve({ data: [] }),
  ]);
  const tagIds = Array.from(
    new Set([
      ...((transactionTagRows ?? []) as TransactionTag[]).map((row) => row.tag_id),
      ...((splitTagRows ?? []) as TransactionSplitTag[]).map((row) => row.tag_id),
    ])
  );
  const { data: tagRows } =
    household && tagIds.length > 0
      ? await supabase.from('tags').select('id, name, color').eq('household_id', household.id).in('id', tagIds)
      : { data: [] };
  const tagById = new Map(((tagRows ?? []) as Pick<Tag, 'id' | 'name' | 'color'>[]).map((tag) => [tag.id, tag]));
  const tagsByTransactionId = new Map<string, Pick<Tag, 'id' | 'name' | 'color'>[]>();
  ((transactionTagRows ?? []) as TransactionTag[]).forEach((row) => {
    const tag = tagById.get(row.tag_id);
    if (tag) {
      tagsByTransactionId.set(row.transaction_id, [...(tagsByTransactionId.get(row.transaction_id) ?? []), tag]);
    }
  });
  const tagsBySplitId = new Map<string, Pick<Tag, 'id' | 'name' | 'color'>[]>();
  ((splitTagRows ?? []) as TransactionSplitTag[]).forEach((row) => {
    const tag = tagById.get(row.tag_id);
    if (tag) {
      tagsBySplitId.set(row.transaction_split_id, [...(tagsBySplitId.get(row.transaction_split_id) ?? []), tag]);
    }
  });
  const monthlyLinesByCategoryId = new Map<string, MonthlyDetailLine[]>();

  actualLines.forEach((line) => {
    if (!line.category_id) {
      return;
    }

    const transaction = transactionById.get(line.transaction_id);
    const tags = line.transaction_split_id
      ? tagsBySplitId.get(line.transaction_split_id) ?? tagsByTransactionId.get(line.transaction_id) ?? []
      : tagsByTransactionId.get(line.transaction_id) ?? [];
    const detailLine: MonthlyDetailLine = {
      ...line,
      description: transaction?.description ?? 'Transaction',
      merchant_name: transaction?.merchant_name ?? null,
      tags,
    };
    monthlyLinesByCategoryId.set(line.category_id, [...(monthlyLinesByCategoryId.get(line.category_id) ?? []), detailLine]);
  });

  const monthlyRows = Math.max(
    MONTHLY_MIN_ROWS,
    ...visibleCategories.map((category) => monthlyLinesByCategoryId.get(category.id)?.length ?? 0)
  );
  const monthExpenseTotals = MONTHS.map((_monthName, monthIndex) =>
    expenseCategories.reduce(
      (total, category) => total + getActualCents(spendingByCategoryMonth, category.id, monthIndex + 1),
      0
    )
  );
  const incomeMonthTotals = MONTHS.map((_monthName, monthIndex) =>
    incomeSections.reduce(
      (total, section) => total + getSectionMonthTotal(section, spendingByCategoryMonth, monthIndex + 1),
      0
    )
  );
  const savingsMonthTotals = MONTHS.map((_monthName, monthIndex) =>
    savingsSections.reduce(
      (total, section) => total + getSectionMonthTotal(section, spendingByCategoryMonth, monthIndex + 1),
      0
    )
  );
  const needsSummarySection = sections.find((section) => section.name.toLowerCase().includes('needs'));
  const wantsSummarySection = sections.find((section) => section.name.toLowerCase().includes('wants') && !section.name.toLowerCase().includes('big'));
  const bigWantsSummarySection = sections.find((section) => section.name.toLowerCase().includes('big'));
  const needsMonthTotals = MONTHS.map((_monthName, monthIndex) =>
    needsSummarySection ? getSectionMonthTotal(needsSummarySection, spendingByCategoryMonth, monthIndex + 1) : 0
  );
  const wantsMonthTotals = MONTHS.map((_monthName, monthIndex) =>
    wantsSummarySection ? getSectionMonthTotal(wantsSummarySection, spendingByCategoryMonth, monthIndex + 1) : 0
  );
  const bigWantsMonthTotals = MONTHS.map((_monthName, monthIndex) =>
    bigWantsSummarySection ? getSectionMonthTotal(bigWantsSummarySection, spendingByCategoryMonth, monthIndex + 1) : 0
  );
  const totalSpentNonBigMonthTotals = MONTHS.map(
    (_monthName, monthIndex) => needsMonthTotals[monthIndex] + wantsMonthTotals[monthIndex]
  );
  const totalSpentMonthTotals = MONTHS.map(
    (_monthName, monthIndex) => needsMonthTotals[monthIndex] + wantsMonthTotals[monthIndex] + bigWantsMonthTotals[monthIndex]
  );
  const cashFlowNonBigMonthTotals = MONTHS.map(
    (_monthName, monthIndex) => incomeMonthTotals[monthIndex] - totalSpentNonBigMonthTotals[monthIndex]
  );
  const cashFlowMonthTotals = MONTHS.map(
    (_monthName, monthIndex) => incomeMonthTotals[monthIndex] - totalSpentMonthTotals[monthIndex]
  );
  const grandTotal = monthExpenseTotals.reduce((total, monthTotal) => total + monthTotal, 0);
  const activeSheetLabel =
    selectedSheet === 'summary' ? 'Year Summary' : `${MONTHS[selectedMonth - 1]} ${selectedYear}`;
  const previousYear = selectedYear - 1;
  const nextYear = selectedYear + 1;
  const needsSection = needsSummarySection;
  const needsBudgetCents =
    needsSection?.categories.reduce((total, category) => total + category.default_monthly_budget_cents, 0) ?? 0;
  const needsSpentCents =
    needsSection?.categories.reduce(
      (total, category) =>
        total +
        (monthlyLinesByCategoryId.get(category.id) ?? []).reduce(
          (categoryTotal, line) => categoryTotal + line.amount_cents,
          0
        ),
      0
    ) ?? 0;
  const needsRemainingCents = needsBudgetCents - needsSpentCents;
  const monthlyIncomeCents = incomeSections.reduce(
    (total, section) => total + getMonthlySectionTotal(section, monthlyLinesByCategoryId),
    0
  );
  const monthlySavingsCents = savingsSections.reduce(
    (total, section) => total + getMonthlySectionTotal(section, monthlyLinesByCategoryId),
    0
  );
  const monthlyExpenseCents = expenseSections.reduce(
    (total, section) => total + getMonthlySectionTotal(section, monthlyLinesByCategoryId),
    0
  );
  const monthlyCashFlowCents = monthlyIncomeCents - monthlyExpenseCents;
  const monthlySavingsRate = monthlyIncomeCents === 0 ? null : monthlySavingsCents / monthlyIncomeCents;
  const liquidBalanceCents =
    (balanceSummaries.find((summary) => summary.key === 'checking')?.balanceCents ?? 0) +
    (balanceSummaries.find((summary) => summary.key === 'savings')?.balanceCents ?? 0) +
    (balanceSummaries.find((summary) => summary.key === 'ccDebt')?.balanceCents ?? 0);
  const bigWantsCapacityCents = liquidBalanceCents - needsBudgetCents * 12;

  return (
    <Container maxWidth={false} disableGutters sx={{ bgcolor: '#f8fafd', color: '#202124', minHeight: '100vh', pb: 8 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, bgcolor: '#f8fafd' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 400 }}>
              Monthly Budget - {selectedYear}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {activeSheetLabel}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button component={Link} href={`/budgets?year=${previousYear}&sheet=${selectedSheet}`} variant="outlined" size="small">
              {previousYear}
            </Button>
            <Chip label={selectedYear} color="primary" sx={{ minWidth: 76 }} />
            <Button component={Link} href={`/budgets?year=${nextYear}&sheet=${selectedSheet}`} variant="outlined" size="small">
              {nextYear}
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ px: 5.5, pt: 1 }}>
        {selectedSheet === 'summary' ? (
          <TableContainer sx={{ overflowX: 'auto', bgcolor: '#fff' }}>
            <Table size="small" sx={{ minWidth: 1420, tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...getCellBorderSx(), width: 170, bgcolor: '#d9d9d9', fontWeight: 700 }} />
                  {MONTHS.map((month) => (
                    <TableCell key={month} sx={{ ...getCellBorderSx(), width: 110, bgcolor: '#d9d9d9', fontWeight: 700 }}>
                      {month}
                    </TableCell>
                  ))}
                  <TableCell sx={{ ...getCellBorderSx(), width: 110, bgcolor: '#d9d9d9', fontWeight: 700 }}>Total</TableCell>
                  <TableCell sx={{ ...getCellBorderSx(), width: 110, bgcolor: '#d9d9d9', fontWeight: 700 }}>Average</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sections.map((section) => {
                  const sectionMonthTotals = MONTHS.map((_month, monthIndex) =>
                    section.categories.reduce(
                      (total, category) => total + getActualCents(spendingByCategoryMonth, category.id, monthIndex + 1),
                      0
                    )
                  );
                  const sectionTotal = sectionMonthTotals.reduce((total, monthTotal) => total + monthTotal, 0);

                  return (
                    <Fragment key={section.id}>
                      <TableRow>
                        <TableCell sx={{ ...getCellBorderSx(), bgcolor: section.headerColor, fontWeight: 700 }}>
                          {section.name}
                        </TableCell>
                        {sectionMonthTotals.map((monthTotal, monthIndex) => (
                          <TableCell
                            key={`${section.id}:${monthIndex}`}
                            align="right"
                            sx={{ ...getCellBorderSx(), bgcolor: section.headerColor }}
                          >
                            {formatSheetAmount(monthTotal, section.role)}
                          </TableCell>
                        ))}
                        <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: section.headerColor, fontWeight: 700 }}>
                          {formatSheetAmount(sectionTotal, section.role)}
                        </TableCell>
                        <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: section.headerColor, fontWeight: 700 }}>
                          {formatSheetAmount(getNonZeroAverage(sectionMonthTotals), section.role)}
                        </TableCell>
                      </TableRow>
                      {section.role === 'expense' ? (
                        <TableRow>
                          <TableCell sx={{ ...getCellBorderSx(), bgcolor: section.headerColor, fontWeight: 700 }}>
                            {section.name} % of Income
                          </TableCell>
                          {sectionMonthTotals.map((monthTotal, monthIndex) => (
                            <TableCell
                              key={`${section.id}:income-percent:${monthIndex}`}
                              align="right"
                              sx={{ ...getCellBorderSx(), bgcolor: section.headerColor }}
                            >
                              {formatIncomePercentage(monthTotal, incomeMonthTotals[monthIndex] ?? 0)}
                            </TableCell>
                          ))}
                          <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: section.headerColor, fontWeight: 700 }}>
                            {formatIncomePercentage(
                              sectionTotal,
                              incomeMonthTotals.reduce((total, monthTotal) => total + monthTotal, 0)
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: section.headerColor, fontWeight: 700 }}>
                            {getAverageIncomePercentage(sectionMonthTotals, incomeMonthTotals)}
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {section.categories.map((category) => {
                        const monthlyActuals = MONTHS.map((_month, monthIndex) =>
                          getActualCents(spendingByCategoryMonth, category.id, monthIndex + 1)
                        );
                        const rowTotal = getYearRowTotal(spendingByCategoryMonth, category.id);
                        return (
                          <TableRow key={category.id}>
                            <TableCell sx={{ ...getCellBorderSx(), bgcolor: section.color }}>{category.name}</TableCell>
                            {MONTHS.map((month, monthIndex) => {
                              const actualCents = getActualCents(spendingByCategoryMonth, category.id, monthIndex + 1);
                              const budgetCents = category.default_monthly_budget_cents;
                              const varianceCents = budgetCents - actualCents;
                              return (
                                <TableCell
                                  key={`${category.id}:${month}`}
                                  align="right"
                                  sx={{
                                    ...getCellBorderSx(),
                                    bgcolor: section.role === 'expense' && varianceCents < 0 ? '#f4cccc' : '#fff',
                                    whiteSpace: 'pre-line',
                                  }}
                                >
                                  {section.role === 'expense'
                                    ? `${actualCents ? formatSheetExpense(actualCents) : '$0.00'}\n${formatSheetVariance(varianceCents)}`
                                    : formatSheetAmount(actualCents, section.role)}
                                </TableCell>
                              );
                            })}
                            <TableCell align="right" sx={{ ...getCellBorderSx() }}>
                              {formatSheetAmount(rowTotal, section.role)}
                            </TableCell>
                            <TableCell align="right" sx={{ ...getCellBorderSx(), whiteSpace: 'pre-line' }}>
                              {section.role === 'expense'
                                ? `${formatSheetExpense(getNonZeroAverage(monthlyActuals))}\n${formatSheetVariance(
                                    Math.round(
                                      monthlyActuals
                                        .map((actualCents) => category.default_monthly_budget_cents - actualCents)
                                        .reduce((total, varianceCents) => total + varianceCents, 0) / 12
                                    )
                                  )}`
                                : formatSheetAmount(getNonZeroAverage(monthlyActuals), section.role)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#b6d7a8', fontWeight: 700 }}>Total Spent</TableCell>
                  {monthExpenseTotals.map((monthTotal, monthIndex) => (
                    <TableCell key={MONTHS[monthIndex]} align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d9ead3' }}>
                      {formatSheetExpense(monthTotal)}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d9ead3', fontWeight: 700 }}>
                    {formatSheetExpense(grandTotal)}
                  </TableCell>
                  <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d9ead3', fontWeight: 700 }}>
                    {formatSheetExpense(Math.round(grandTotal / 12))}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#d9d2e9', fontWeight: 700 }}>Income</TableCell>
                  {incomeMonthTotals.map((monthTotal, monthIndex) => (
                    <TableCell key={`income:${MONTHS[monthIndex]}`} align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d9d2e9' }}>
                      {formatCurrency(monthTotal)}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d9d2e9', fontWeight: 700 }}>
                    {formatCurrency(incomeMonthTotals.reduce((total, monthTotal) => total + monthTotal, 0))}
                  </TableCell>
                  <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d9d2e9', fontWeight: 700 }}>
                    {formatCurrency(getNonZeroAverage(incomeMonthTotals))}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#fff2cc', fontWeight: 700 }}>Savings Rate</TableCell>
                  {savingsMonthTotals.map((monthTotal, monthIndex) => {
                    const incomeTotal = incomeMonthTotals[monthIndex] ?? 0;
                    return (
                      <TableCell key={`savings-rate:${MONTHS[monthIndex]}`} align="right" sx={{ ...getCellBorderSx(), bgcolor: '#fff2cc' }}>
                        {formatSavingsRate(monthTotal, incomeTotal)}
                      </TableCell>
                    );
                  })}
                  <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#fff2cc', fontWeight: 700 }}>
                    {incomeMonthTotals.reduce((total, monthTotal) => total + monthTotal, 0)
                      ? `${(
                          (savingsMonthTotals.reduce((total, monthTotal) => total + monthTotal, 0) /
                            incomeMonthTotals.reduce((total, monthTotal) => total + monthTotal, 0)) *
                          100
                        ).toFixed(2)}%`
                      : 'No entries.'}
                  </TableCell>
                  <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#fff2cc', fontWeight: 700 }}>
                    {getAverageIncomePercentage(savingsMonthTotals, incomeMonthTotals)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#fff2cc', fontWeight: 700 }}>Savings Transfers</TableCell>
                  {savingsMonthTotals.map((monthTotal, monthIndex) => (
                    <TableCell key={`savings:${MONTHS[monthIndex]}`} align="right" sx={{ ...getCellBorderSx(), bgcolor: '#fff2cc' }}>
                      {formatCurrency(monthTotal)}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#fff2cc', fontWeight: 700 }}>
                    {formatCurrency(savingsMonthTotals.reduce((total, monthTotal) => total + monthTotal, 0))}
                  </TableCell>
                  <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#fff2cc', fontWeight: 700 }}>
                    {formatCurrency(getNonZeroAverage(savingsMonthTotals))}
                  </TableCell>
                </TableRow>
                {[
                  { label: 'Total Spent (Non-Big)', values: totalSpentNonBigMonthTotals },
                  { label: 'Cash Flow (Non-Big)', values: cashFlowNonBigMonthTotals, cashFlow: true },
                  { label: 'Total Spent', values: totalSpentMonthTotals },
                  { label: 'Cash Flow', values: cashFlowMonthTotals, cashFlow: true },
                ].map((row) => {
                  const total = row.values.reduce((sum, value) => sum + value, 0);
                  const average = getNonZeroAverage(row.values);
                  return (
                    <TableRow key={row.label}>
                      <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#b6d7a8', fontWeight: 700 }}>{row.label}</TableCell>
                      {row.values.map((value, monthIndex) => (
                        <TableCell key={`${row.label}:${MONTHS[monthIndex]}`} align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d9ead3' }}>
                          {row.cashFlow ? formatCurrency(value) : formatSheetExpense(value)}
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d9ead3', fontWeight: 700 }}>
                        {row.cashFlow ? formatCurrency(total) : formatSheetExpense(total)}
                      </TableCell>
                      <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d9ead3', fontWeight: 700 }}>
                        {row.cashFlow ? formatCurrency(average) : formatSheetExpense(average)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableFooter>
            </Table>
          </TableContainer>
        ) : (
          <TableContainer sx={{ overflowX: 'auto', bgcolor: '#fff' }}>
            <Table size="small" sx={{ minWidth: 1420, tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <TableBody>
                <TableRow>
                  {balanceSummaries.map((summary) => (
                    <TableCell key={summary.key} sx={{ ...getCellBorderSx(), width: 112, bgcolor: '#a9c7c9', fontWeight: 700 }}>
                      {summary.label}
                    </TableCell>
                  ))}
                  <TableCell sx={{ ...getCellBorderSx(), width: 112, bgcolor: '#d9d9d9', fontWeight: 700 }}>Total</TableCell>
                  <TableCell
                    colSpan={Math.max(1, visibleCategories.length + 1 - balanceSummaryCellCount)}
                    sx={{ ...getCellBorderSx(), bgcolor: '#444', borderColor: '#444' }}
                  />
                </TableRow>
                <TableRow>
                  {balanceSummaries.map((summary) => (
                    <TableCell key={summary.key} sx={{ ...getCellBorderSx(), bgcolor: '#f3f3f3' }}>
                      {summary.key === 'ccDebt' ? 'Credit cards' : summary.key === 'investments' ? 'Investment accounts' : 'Bank accounts'}
                    </TableCell>
                  ))}
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#f3f3f3' }} />
                  <TableCell
                    colSpan={Math.max(1, visibleCategories.length + 1 - balanceSummaryCellCount)}
                    sx={{ ...getCellBorderSx(), bgcolor: '#444', borderColor: '#444' }}
                  />
                </TableRow>
                <TableRow>
                  {balanceSummaries.map((summary) => (
                    <TableCell key={summary.key} align="right" sx={{ ...getCellBorderSx(), bgcolor: '#f3f3f3' }}>
                      {formatSheetTotal(summary.balanceCents)}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d9d9d9', fontWeight: 700 }}>
                    {formatSheetTotal(balanceSummaryTotalCents)}
                  </TableCell>
                  <TableCell
                    colSpan={Math.max(1, visibleCategories.length + 1 - balanceSummaryCellCount)}
                    sx={{ ...getCellBorderSx(), bgcolor: '#444', borderColor: '#444' }}
                  />
                </TableRow>
                <TableRow>
                  {sections.map((section) => (
                    <Fragment key={section.id}>
                      <TableCell
                        colSpan={section.categories.length}
                        align="center"
                        sx={{ ...getCellBorderSx(), bgcolor: section.headerColor, fontWeight: 700 }}
                      >
                        {section.name}
                      </TableCell>
                      {section.id === needsSection?.id ? (
                        <TableCell
                          align="center"
                          rowSpan={2}
                          sx={{ ...getCellBorderSx(), bgcolor: '#a9c7c9', fontWeight: 700 }}
                        >
                          Budget
                        </TableCell>
                      ) : null}
                    </Fragment>
                  ))}
                </TableRow>
                <TableRow>
                  {sections.map((section) => (
                    <Fragment key={`${section.id}:categories`}>
                      {section.categories.map((category) => (
                        <TableCell key={category.id} sx={{ ...getCellBorderSx(), bgcolor: section.color }}>
                          {category.name}
                        </TableCell>
                      ))}
                    </Fragment>
                  ))}
                </TableRow>
                <TableRow>
                  {sections.map((section) => (
                    <Fragment key={`${section.id}:budgets`}>
                      {section.id === bigWantsSummarySection?.id ? (
                        <TableCell
                          align="center"
                          colSpan={section.categories.length}
                          sx={{ ...getCellBorderSx(), bgcolor: '#d9d9d9', fontWeight: 700 }}
                        >
                          {formatCurrency(bigWantsCapacityCents)}
                        </TableCell>
                      ) : (
                        section.categories.map((category) => (
                          <TableCell key={category.id} align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d9d9d9' }}>
                            {section.role === 'expense' ? formatCurrency(category.default_monthly_budget_cents) : null}
                          </TableCell>
                        ))
                      )}
                      {section.id === needsSection?.id ? (
                        <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d9d9d9', fontWeight: 700 }}>
                          {formatCurrency(needsBudgetCents)}
                        </TableCell>
                      ) : null}
                    </Fragment>
                  ))}
                </TableRow>
                {Array.from({ length: monthlyRows }, (_value, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {sections.map((section) => (
                      <Fragment key={`${section.id}:row:${rowIndex}`}>
                        {section.categories.map((category) => {
                          const lines = monthlyLinesByCategoryId.get(category.id) ?? [];
                          const line = lines[rowIndex];
                          return (
                            <TableCell
                              key={category.id}
                              align="right"
                              sx={{
                                ...getCellBorderSx(),
                                bgcolor: line ? (section.role === 'expense' ? '#f4cccc' : '#d9ead3') : '#fff',
                                color: line ? getLineFontColor(line) : '#000',
                              }}
                            >
                              {line ? (
                                <Tooltip
                                  title={<Box sx={{ whiteSpace: 'pre-line' }}>{getMonthlyLineTooltip(line)}</Box>}
                                  arrow
                                  placement="right"
                                >
                                  <Box sx={{ cursor: 'default' }}>{formatSheetAmount(line.amount_cents, section.role)}</Box>
                                </Tooltip>
                              ) : null}
                            </TableCell>
                          );
                        })}
                        {section.id === needsSection?.id ? (
                          <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#d9d9d9', borderColor: '#000' }} />
                        ) : null}
                      </Fragment>
                    ))}
                  </TableRow>
                ))}
                <TableRow>
                  {sections.map((section) => (
                    <Fragment key={`${section.id}:totals`}>
                      {section.categories.map((category) => {
                        const total = (monthlyLinesByCategoryId.get(category.id) ?? []).reduce(
                          (categoryTotal, line) => categoryTotal + getDisplayActualCents(line.amount_cents),
                          0
                        );
                        return (
                          <TableCell
                            key={category.id}
                            align="right"
                            sx={{ ...getCellBorderSx(), bgcolor: section.role === 'expense' ? '#f4cccc' : '#d9ead3' }}
                          >
                            {formatSheetAmount(total, section.role)}
                          </TableCell>
                        );
                      })}
                      {section.id === needsSection?.id ? (
                        <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#f4cccc', fontWeight: 700 }}>
                          {formatSheetExpense(needsSpentCents)}
                        </TableCell>
                      ) : null}
                    </Fragment>
                  ))}
                </TableRow>
                <TableRow>
                  {sections.map((section) => (
                    <Fragment key={`${section.id}:remaining`}>
                      {section.categories.map((category) => {
                        const total = (monthlyLinesByCategoryId.get(category.id) ?? []).reduce(
                          (categoryTotal, line) => categoryTotal + getDisplayActualCents(line.amount_cents),
                          0
                        );
                        const remaining = category.default_monthly_budget_cents - total;
                        const categoryIndex = section.categories.findIndex((sectionCategory) => sectionCategory.id === category.id);
                        const calculatedValue =
                          section.role === 'income' && categoryIndex === 0
                            ? formatCurrency(monthlyCashFlowCents)
                            : section.role === 'savings' && categoryIndex === 0
                              ? monthlySavingsRate === null
                                ? 'No Income'
                                : `${(monthlySavingsRate * 100).toFixed(2)}%`
                              : null;
                        return (
                          <TableCell
                            key={category.id}
                            align="right"
                            sx={{
                              ...getCellBorderSx(),
                              bgcolor:
                                section.role === 'expense'
                                  ? remaining < 0
                                    ? '#f4cccc'
                                    : '#d9ead3'
                                  : calculatedValue
                                    ? '#d9ead3'
                                    : '#444',
                              borderColor: section.role !== 'expense' && !calculatedValue ? '#444' : '#000',
                            }}
                          >
                            {section.role === 'expense' ? formatCurrency(remaining) : calculatedValue}
                          </TableCell>
                        );
                      })}
                      {section.id === needsSection?.id ? (
                        <TableCell
                          align="right"
                          sx={{ ...getCellBorderSx(), bgcolor: needsRemainingCents >= 0 ? '#d9ead3' : '#f4cccc', fontWeight: 700 }}
                        >
                          {formatCurrency(needsRemainingCents)}
                        </TableCell>
                      ) : null}
                    </Fragment>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          px: 2,
          py: 1,
          bgcolor: '#f1f3f4',
          borderTop: '1px solid #dadce0',
          overflowX: 'auto',
          zIndex: 10,
        }}
      >
        {MONTH_SLUGS.map((monthSlug, index) => {
          const isActive = selectedSheet === monthSlug;
          return (
            <Chip
              key={monthSlug}
              component={Link}
              href={`/budgets?year=${selectedYear}&sheet=${monthSlug}`}
              clickable
              label={MONTHS[index]}
              sx={{
                bgcolor: isActive ? '#6dff2e' : '#fff',
                border: '1px solid',
                borderColor: isActive ? '#6dff2e' : '#c8ced8',
                borderRadius: 1,
                color: '#202124',
                fontWeight: isActive ? 700 : 500,
                '&:hover': {
                  bgcolor: isActive ? '#8dff62' : '#eef2f7',
                },
              }}
            />
          );
        })}
        <Chip
          component={Link}
          href={`/budgets?year=${selectedYear}&sheet=summary`}
          clickable
          label="Year Summary"
          sx={{
            bgcolor: selectedSheet === 'summary' ? '#6dff2e' : '#fff',
            border: '1px solid',
            borderColor: selectedSheet === 'summary' ? '#6dff2e' : '#c8ced8',
            borderRadius: 1,
            color: '#202124',
            fontWeight: selectedSheet === 'summary' ? 700 : 500,
            '&:hover': {
              bgcolor: selectedSheet === 'summary' ? '#8dff62' : '#eef2f7',
            },
          }}
        />
      </Stack>
    </Container>
  );
}
