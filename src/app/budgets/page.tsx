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
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { getAccountBalanceCategory } from '@/lib/accountBalanceCategories';
import {
  calculateRolloverCategoryBalance,
  type CategoryBalanceActivity,
  type RolloverCategoryBalance,
} from '@/lib/categoryBalances';
import { resolveCategoryLayout } from '@/lib/categoryLayouts';
import { resolveCategoryBudgetAmount } from '@/lib/constantPeriods';
import { groupBudgetLines, type BudgetLineGroup } from '@/lib/budgetLineGrouping';
import { getCurrentHousehold } from '@/lib/households';
import { formatCurrency } from '@/lib/money';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import FunMoneyAdjustmentDialog from '@/components/budgets/FunMoneyAdjustmentDialog';
import type {
  Account,
  AccountBalanceSnapshot,
  BudgetActualLine,
  BudgetTransactionGroup,
  BudgetTransactionGroupMember,
  Category,
  CategoryBalanceAdjustment,
  CategoryBudgetPeriod,
  CategoryLayoutPeriod,
  MonthlySpending,
  Tag,
  TransactionSplitTag,
  TransactionTag,
} from '@/types/database';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'] as const;
const MONTH_SLUGS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;
const MONTHLY_MIN_ROWS = 18;
const MONTHLY_TRAILING_ROWS = 3;
const MONTHLY_STICKY_ROW_HEIGHT = 22;

interface BudgetsPageProps {
  searchParams?: {
    year?: string;
    sheet?: string;
  };
}

interface MonthlyDetailLine extends BudgetActualLine {
  budget_group_id: string | null;
  budget_group_name: string | null;
  description: string;
  merchant_name: string | null;
  tags: Pick<Tag, 'id' | 'name' | 'color'>[];
}

type MonthlyDisplayLine = BudgetLineGroup<MonthlyDetailLine>;

interface CategorySection {
  id: string;
  name: string;
  color: string;
  headerColor: string;
  role: 'expense' | 'income' | 'savings';
  targetPercent: number | null;
  categories: Category[];
}

interface OrderedCategorySection extends CategorySection {
  order: number;
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

const GROUP_PRESENTATION = [
  { key: 'needs', name: 'Needs', color: '#c9daf8', headerColor: '#9fc5e8', order: 10 },
  { key: 'wants', name: 'Wants', color: '#fce5cd', headerColor: '#f9cb9c', order: 20 },
  { key: 'bigwants', name: 'Big Wants', color: '#e6b8af', headerColor: '#dd7e6b', order: 30 },
  { key: 'income', name: 'Income', color: '#d9d2e9', headerColor: '#b4a7d6', order: 40 },
  { key: 'savings', name: 'Savings', color: '#fff2cc', headerColor: '#ffe599', order: 50 },
];

function normalizeGroupKey(sectionOrCategory: Pick<Category, 'name' | 'group_key'>): string {
  const groupKey = sectionOrCategory.group_key?.toLowerCase();
  const name = sectionOrCategory.name.toLowerCase();

  if (groupKey === 'bigwants' || (name.includes('big') && name.includes('want'))) {
    return 'bigwants';
  }

  if (groupKey === 'needs' || name.includes('need')) {
    return 'needs';
  }

  if (groupKey === 'wants' || name.includes('want')) {
    return 'wants';
  }

  if (groupKey === 'income' || name.includes('income')) {
    return 'income';
  }

  if (groupKey === 'savings' || name.includes('savings')) {
    return 'savings';
  }

  return groupKey ?? name;
}

function getGroupPresentation(group: Category, fallbackIndex: number) {
  return (
    GROUP_PRESENTATION.find((presentation) => presentation.key === normalizeGroupKey(group)) ?? {
      key: normalizeGroupKey(group),
      name: group.name,
      color: '#eeeeee',
      headerColor: '#d9d9d9',
      order: 1000 + fallbackIndex,
    }
  );
}

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

function getDisplayActualCents(cents: number, role: CategorySection['role'] = 'expense'): number {
  return role === 'expense' ? cents : Math.abs(cents);
}

function getYearRowTotal(spendingByCategoryMonth: Map<string, number>, categoryId: string): number {
  return MONTHS.reduce(
    (total, _monthName, monthIndex) => total + getActualCents(spendingByCategoryMonth, categoryId, monthIndex + 1),
    0
  );
}

function getCategorySections(categories: Category[], layoutPeriods: CategoryLayoutPeriod[], year: number, month: number): CategorySection[] {
  const groups = categories.filter((category) => category.is_group);
  const childCategories = categories.filter((category) => !category.is_group);
  const effectiveLayouts = resolveCategoryLayout(categories, layoutPeriods, year, month).filter((layout) => layout.isVisible);
  const layoutByCategoryId = new Map(effectiveLayouts.map((layout) => [layout.category.id, layout]));

  const sections: OrderedCategorySection[] = groups
    .map((group, index) => {
      const presentation = getGroupPresentation(group, index);

      return {
        id: group.id,
        name: presentation.name,
        color: presentation.color,
        headerColor: presentation.headerColor,
        role: getSectionRole(group),
        targetPercent: group.target_percent == null ? null : Number(group.target_percent),
        order: presentation.order,
        categories: childCategories
          .filter((category) => layoutByCategoryId.get(category.id)?.parentCategoryId === group.id)
          .sort(
            (firstCategory, secondCategory) =>
              (layoutByCategoryId.get(firstCategory.id)?.sortOrder ?? firstCategory.sort_order ?? 0) -
              (layoutByCategoryId.get(secondCategory.id)?.sortOrder ?? secondCategory.sort_order ?? 0)
          ),
      };
    })
    .filter((section) => section.categories.length > 0);
  sections.sort((firstSection, secondSection) => firstSection.order - secondSection.order);

  const orphanCategories = childCategories
    .filter((category) => layoutByCategoryId.has(category.id) && !layoutByCategoryId.get(category.id)?.parentCategoryId)
    .sort(
      (firstCategory, secondCategory) =>
        (layoutByCategoryId.get(firstCategory.id)?.sortOrder ?? firstCategory.sort_order ?? 0) -
        (layoutByCategoryId.get(secondCategory.id)?.sortOrder ?? secondCategory.sort_order ?? 0)
    );
  if (orphanCategories.length > 0) {
    sections.push({
      id: 'other',
      name: 'Other',
      color: '#eeeeee',
      headerColor: '#d9d9d9',
      role: 'expense',
      targetPercent: null,
      order: 9999,
      categories: orphanCategories,
    });
  }

  return sections.map(({ order: _order, ...section }) => section);
}

function getYearCategorySections(sectionsByMonth: CategorySection[][]): CategorySection[] {
  const sectionById = new Map<string, CategorySection>();
  const seenCategoryIds = new Set<string>();

  sectionsByMonth.forEach((monthSections) => {
    monthSections.forEach((section) => {
      const existingSection = sectionById.get(section.id);
      if (!existingSection) {
        sectionById.set(section.id, { ...section, categories: [] });
      }

      const unionSection = sectionById.get(section.id);
      if (!unionSection) {
        return;
      }

      section.categories.forEach((category) => {
        if (!seenCategoryIds.has(category.id)) {
          unionSection.categories.push(category);
          seenCategoryIds.add(category.id);
        }
      });
    });
  });

  return Array.from(sectionById.values()).filter((section) => section.categories.length > 0);
}

function getSheetCategoryName(category: Category, section: CategorySection): string {
  if (section.role === 'income' && category.name.toLowerCase() === 'income transfers') {
    return 'Transfers';
  }

  if (section.role === 'savings' && category.name.toLowerCase() === 'savings transfers') {
    return 'Transfers';
  }

  return category.name;
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
  return line.merchant_name?.trim() || line.description;
}

function getMonthlyLineTooltip(line: MonthlyDetailLine): string {
  const note = line.notes?.trim();
  const title = getMonthlyLineTitle(line);
  const tags = line.tags.length ? `Tags: ${line.tags.map((tag) => tag.name).join(', ')}` : null;
  const base = [title, line.date, tags].filter(Boolean).join('\n');

  return note && note !== title ? `${base}\n${note}` : base;
}

function getMonthlyDisplayLineTooltip(
  displayLine: MonthlyDisplayLine,
  role: CategorySection['role']
): string {
  if (displayLine.lines.length === 1) {
    return getMonthlyLineTooltip(displayLine.lines[0]);
  }

  const firstDate = displayLine.lines[0]?.date;
  const lastDate = displayLine.lines[displayLine.lines.length - 1]?.date;
  const dateRange = firstDate === lastDate ? firstDate : `${firstDate} – ${lastDate}`;
  const previewLines = displayLine.lines
    .slice(0, 5)
    .map((line) => `${line.date}: ${formatSheetAmount(line.amount_cents, role)}`);
  const remainingCount = displayLine.lines.length - previewLines.length;

  return [
    displayLine.label,
    `${displayLine.lines.length} transactions`,
    dateRange,
    '',
    ...previewLines,
    remainingCount > 0 ? `…and ${remainingCount} more` : null,
    '',
    'Manage this group from Transactions.',
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n');
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

function getDisplayLineFontColor(displayLine: MonthlyDisplayLine): string {
  const colors = new Set(displayLine.lines.map(getLineFontColor));
  return colors.size === 1 ? Array.from(colors)[0] : '#000';
}

function formatSheetExpense(cents: number): string {
  if (!cents) {
    return '$0.00';
  }

  return formatCurrency(-cents);
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

function getCategoryBudgetCents(category: Category, periods: CategoryBudgetPeriod[], year: number, month: number): number {
  return resolveCategoryBudgetAmount(
    category.id,
    category.default_monthly_budget_cents,
    periods,
    year,
    month
  ).amount_cents;
}

function getExpenseVarianceCents(actualCents: number, budgetCents: number): number {
  return budgetCents - actualCents;
}

function getSectionMonthTotal(section: CategorySection, spendingByCategoryMonth: Map<string, number>, month: number): number {
  return section.categories.reduce(
    (total, category) =>
      total + getDisplayActualCents(getCategoryMonthTotal(spendingByCategoryMonth, category, month), section.role),
    0
  );
}

function getMonthlySectionTotal(section: CategorySection, monthlyLinesByCategoryId: Map<string, MonthlyDetailLine[]>): number {
  return section.categories.reduce(
    (total, category) =>
      total +
      (monthlyLinesByCategoryId.get(category.id) ?? []).reduce(
        (categoryTotal, line) => categoryTotal + getDisplayActualCents(line.amount_cents, section.role),
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

function getAverageIncomePercentage(amountTotals: number[], incomeTotals: number[], sign = 1): string {
  const rates = amountTotals
    .map((amountTotal, monthIndex) => {
      const incomeTotal = incomeTotals[monthIndex] ?? 0;
      return incomeTotal ? amountTotal / incomeTotal : null;
    })
    .filter((rate): rate is number => rate !== null && rate !== 0);

  if (rates.length === 0) {
    return 'No entries.';
  }

  return `${((rates.reduce((sum, rate) => sum + rate, 0) / rates.length) * sign * 100).toFixed(2)}%`;
}

function formatIncomePercentage(
  amountCents: number,
  incomeCents: number,
  sign = 1,
  noIncomeValue = 'No entries.'
): string {
  return incomeCents ? `${((amountCents / incomeCents) * sign * 100).toFixed(2)}%` : noIncomeValue;
}

function getAverageExpenseVarianceCents(actuals: number[], budgets: number[]): number {
  const populatedVariances = actuals.flatMap((actualCents, monthIndex) =>
    actualCents === 0 ? [] : [getExpenseVarianceCents(actualCents, budgets[monthIndex] ?? 0)]
  );

  return populatedVariances.length
    ? Math.round(populatedVariances.reduce((total, variance) => total + variance, 0) / populatedVariances.length)
    : 0;
}

function getSummarySectionLabel(section: CategorySection): string {
  if (section.targetPercent == null) {
    return section.name;
  }

  const target = Number.isInteger(section.targetPercent) ? section.targetPercent.toFixed(0) : section.targetPercent.toFixed(1);
  return `${section.name} (${target}%)`;
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

function getStickyCellSx(position: 'top' | 'bottom', offset: number, zIndex = 2) {
  return {
    position: 'sticky',
    [position]: offset,
    zIndex,
    backgroundClip: 'padding-box',
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

function getMonthBalanceSnapshots(
  snapshots: AccountBalanceSnapshot[],
  year: number,
  month: number
): Map<string, AccountBalanceSnapshot> {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
  return getClosestBalanceSnapshots(
    snapshots.filter((snapshot) => snapshot.recorded_at.startsWith(monthPrefix)),
    getMonthStartDate(year, month)
  );
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

function getYearBalanceRows(
  accounts: Account[],
  snapshots: AccountBalanceSnapshot[],
  year: number
): Array<{ label: string; values: number[] }> {
  const monthlyValues = MONTHS.map((_monthName, monthIndex) => {
    const snapshotByAccountId = getMonthBalanceSnapshots(snapshots, year, monthIndex + 1);
    const sumSnapshots = (category: BalanceSummary['key'], sign: 'asset' | 'debt' = 'asset') => {
      const total = accounts
        .filter((account) => account.is_active && getAccountBalanceCategory(account) === category)
        .reduce((sum, account) => {
          const snapshot = snapshotByAccountId.get(account.id);
          return snapshot ? sum + Math.abs(snapshot.current_balance_cents ?? 0) : sum;
        }, 0);

      return sign === 'debt' ? -total : total;
    };
    const cash = sumSnapshots('checking') + sumSnapshots('savings');
    const ccDebt = sumSnapshots('ccDebt', 'debt');
    const liquid = cash + ccDebt;
    const investments = sumSnapshots('investments');

    return { cash, ccDebt, liquid, investments, overall: liquid + investments };
  });

  return [
    { label: 'Cash Balance', values: monthlyValues.map((value) => value.cash) },
    { label: 'CC Debt', values: monthlyValues.map((value) => value.ccDebt) },
    { label: 'Liquid', values: monthlyValues.map((value) => value.liquid) },
    { label: 'Investment Balance', values: monthlyValues.map((value) => value.investments) },
    { label: 'Overall Balance', values: monthlyValues.map((value) => value.overall) },
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
    { data: categoryLayoutRows },
    { data: categoryBudgetPeriodRows },
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
          .from('category_layout_periods')
          .select('*')
          .eq('household_id', household.id),
        supabase
          .from('category_budget_periods')
          .select('*')
          .eq('household_id', household.id)
          .lte('year', selectedYear),
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
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const categories = (categoryRows ?? []) as Category[];
  const categoryLayouts = (categoryLayoutRows ?? []) as CategoryLayoutPeriod[];
  const categoryBudgetPeriods = (categoryBudgetPeriodRows ?? []) as CategoryBudgetPeriod[];
  const rolloverCategories = categories.filter(
    (category) =>
      category.rollover_enabled &&
      category.rollover_start_date &&
      category.rollover_start_date <= endDate
  );
  const rolloverCategoryIds = rolloverCategories.map((category) => category.id);
  const earliestRolloverDate = rolloverCategories
    .map((category) => category.rollover_start_date as string)
    .sort()[0];
  const [{ data: rolloverActivityRows }, { data: balanceAdjustmentRows }] =
    household && rolloverCategoryIds.length > 0 && earliestRolloverDate
      ? await Promise.all([
          supabase
            .from('budget_actual_lines')
            .select('category_id, date, amount_cents')
            .eq('household_id', household.id)
            .eq('pending', false)
            .in('category_id', rolloverCategoryIds)
            .gte('date', earliestRolloverDate)
            .lte('date', endDate),
          supabase
            .from('category_balance_adjustments')
            .select('*')
            .eq('household_id', household.id)
            .in('category_id', rolloverCategoryIds)
            .eq('status', 'posted')
            .gte('effective_date', earliestRolloverDate)
            .lte('effective_date', endDate)
            .order('effective_date', { ascending: true }),
        ])
      : [{ data: [] }, { data: [] }];
  const rolloverActivity = (rolloverActivityRows ?? []) as CategoryBalanceActivity[];
  const balanceAdjustments = (balanceAdjustmentRows ?? []) as CategoryBalanceAdjustment[];
  const rolloverBalanceByCategoryId = new Map<string, RolloverCategoryBalance>(
    rolloverCategories.map((category) => [
      category.id,
      calculateRolloverCategoryBalance(
        category,
        categoryBudgetPeriods,
        rolloverActivity,
        balanceAdjustments,
        selectedYear,
        selectedMonth
      ),
    ])
  );
  const currentMonthAdjustments = balanceAdjustments.filter(
    (adjustment) =>
      adjustment.effective_date >= startDate && adjustment.effective_date <= endDate
  );
  const accountSummaries = (accountRows ?? []) as Account[];
  const balanceSnapshots = (balanceSnapshotRows ?? []) as AccountBalanceSnapshot[];
  const balanceSnapshotByAccountId = getClosestBalanceSnapshots(
    balanceSnapshots,
    getMonthStartDate(selectedYear, selectedMonth)
  );
  const balanceSummaries = getBalanceSummaries(accountSummaries, balanceSnapshotByAccountId);
  const balanceSummaryTotalCents = balanceSummaries.reduce((total, summary) => total + summary.balanceCents, 0);
  const balanceSummaryCellCount = balanceSummaries.length + 1;
  const spending = (spendingRows ?? []) as MonthlySpending[];
  const selectedMonthSections = getCategorySections(categories, categoryLayouts, selectedYear, selectedMonth);
  const sectionsByMonth = MONTHS.map((_monthName, monthIndex) =>
    getCategorySections(categories, categoryLayouts, selectedYear, monthIndex + 1)
  );
  const yearSections = getYearCategorySections(sectionsByMonth);
  const sections = selectedSheet === 'summary' ? yearSections : selectedMonthSections;
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
  const transactionIds = Array.from(
    new Set(actualLines.map((line) => line.transaction_id).filter((transactionId): transactionId is string => Boolean(transactionId)))
  );
  const monthlySplitIds = actualLines
    .map((line) => line.transaction_split_id)
    .filter((splitId): splitId is string => Boolean(splitId));
  const [{ data: transactionTagRows }, { data: splitTagRows }, { data: budgetGroupMemberRows }] = await Promise.all([
    transactionIds.length > 0
      ? supabase.from('transaction_tags').select('transaction_id, tag_id').in('transaction_id', transactionIds)
      : Promise.resolve({ data: [] }),
    monthlySplitIds.length > 0
      ? supabase.from('transaction_split_tags').select('transaction_split_id, tag_id').in('transaction_split_id', monthlySplitIds)
      : Promise.resolve({ data: [] }),
    household && transactionIds.length > 0
      ? supabase
          .from('budget_transaction_group_members')
          .select('transaction_id, group_id, household_id, created_by, created_at')
          .eq('household_id', household.id)
          .in('transaction_id', transactionIds)
      : Promise.resolve({ data: [] }),
  ]);
  const budgetGroupIds = Array.from(
    new Set(
      ((budgetGroupMemberRows ?? []) as BudgetTransactionGroupMember[]).map((member) => member.group_id)
    )
  );
  const { data: budgetGroupRows } =
    household && budgetGroupIds.length > 0
      ? await supabase
          .from('budget_transaction_groups')
          .select('*')
          .eq('household_id', household.id)
          .in('id', budgetGroupIds)
      : { data: [] };
  const budgetGroupById = new Map(
    ((budgetGroupRows ?? []) as BudgetTransactionGroup[]).map((group) => [group.id, group])
  );
  const budgetGroupIdByTransactionId = new Map(
    ((budgetGroupMemberRows ?? []) as BudgetTransactionGroupMember[]).map((member) => [
      member.transaction_id,
      member.group_id,
    ])
  );
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

    const tags = line.transaction_split_id
      ? tagsBySplitId.get(line.transaction_split_id) ??
        (line.transaction_id ? tagsByTransactionId.get(line.transaction_id) : undefined) ??
        []
      : line.transaction_id
        ? tagsByTransactionId.get(line.transaction_id) ?? []
        : [];
    const detailLine: MonthlyDetailLine = {
      ...line,
      budget_group_id: line.transaction_id
        ? budgetGroupIdByTransactionId.get(line.transaction_id) ?? null
        : null,
      budget_group_name: line.transaction_id
        ? budgetGroupById.get(budgetGroupIdByTransactionId.get(line.transaction_id) ?? '')?.name ?? null
        : null,
      description: line.description,
      merchant_name: line.merchant_name,
      tags,
    };
    monthlyLinesByCategoryId.set(line.category_id, [...(monthlyLinesByCategoryId.get(line.category_id) ?? []), detailLine]);
  });

  const monthlyDisplayLinesByCategoryId = new Map<string, MonthlyDisplayLine[]>(
    visibleCategories.map((category) => {
      const lines = monthlyLinesByCategoryId.get(category.id) ?? [];
      return [category.id, groupBudgetLines(lines)];
    })
  );
  const longestMonthlyCategory = Math.max(
    0,
    ...visibleCategories.map((category) => monthlyDisplayLinesByCategoryId.get(category.id)?.length ?? 0)
  );
  const monthlyRows = Math.max(MONTHLY_MIN_ROWS, longestMonthlyCategory + MONTHLY_TRAILING_ROWS);
  const incomeMonthTotals = MONTHS.map((_monthName, monthIndex) =>
    sectionsByMonth[monthIndex]
      .filter((section) => section.role === 'income')
      .reduce(
        (total, section) => total + getSectionMonthTotal(section, spendingByCategoryMonth, monthIndex + 1),
        0
      )
  );
  const savingsMonthTotals = MONTHS.map((_monthName, monthIndex) =>
    sectionsByMonth[monthIndex]
      .filter((section) => section.role === 'savings')
      .reduce(
        (total, section) => total + getSectionMonthTotal(section, spendingByCategoryMonth, monthIndex + 1),
        0
      )
  );
  const needsSummarySection = sections.find((section) => section.name.toLowerCase().includes('needs'));
  const wantsSummarySection = sections.find((section) => section.name.toLowerCase().includes('wants') && !section.name.toLowerCase().includes('big'));
  const bigWantsSummarySection = sections.find((section) => section.name.toLowerCase().includes('big'));
  const needsMonthTotals = MONTHS.map((_monthName, monthIndex) => {
    const section = sectionsByMonth[monthIndex].find((candidate) =>
      candidate.name.toLowerCase().includes('needs')
    );
    return section ? getSectionMonthTotal(section, spendingByCategoryMonth, monthIndex + 1) : 0;
  });
  const wantsMonthTotals = MONTHS.map((_monthName, monthIndex) => {
    const section = sectionsByMonth[monthIndex].find(
      (candidate) =>
        candidate.name.toLowerCase().includes('wants') &&
        !candidate.name.toLowerCase().includes('big')
    );
    return section ? getSectionMonthTotal(section, spendingByCategoryMonth, monthIndex + 1) : 0;
  });
  const bigWantsMonthTotals = MONTHS.map((_monthName, monthIndex) => {
    const section = sectionsByMonth[monthIndex].find((candidate) =>
      candidate.name.toLowerCase().includes('big')
    );
    return section ? getSectionMonthTotal(section, spendingByCategoryMonth, monthIndex + 1) : 0;
  });
  const totalSpentNonBigMonthTotals = MONTHS.map(
    (_monthName, monthIndex) => -needsMonthTotals[monthIndex] - wantsMonthTotals[monthIndex]
  );
  const totalSpentMonthTotals = MONTHS.map(
    (_monthName, monthIndex) => totalSpentNonBigMonthTotals[monthIndex] - bigWantsMonthTotals[monthIndex]
  );
  const cashFlowNonBigMonthTotals = MONTHS.map(
    (_monthName, monthIndex) => incomeMonthTotals[monthIndex] + totalSpentNonBigMonthTotals[monthIndex]
  );
  const cashFlowMonthTotals = MONTHS.map(
    (_monthName, monthIndex) => incomeMonthTotals[monthIndex] + totalSpentMonthTotals[monthIndex]
  );
  const summaryBalanceRows = getYearBalanceRows(accountSummaries, balanceSnapshots, selectedYear);
  const summaryExpenseSections = expenseSections.filter((section) => section.categories.length > 0);
  const wantsTotalsMonthTotals = MONTHS.map(
    (_monthName, monthIndex) => -wantsMonthTotals[monthIndex] - bigWantsMonthTotals[monthIndex]
  );
  const wantsTargetPercent =
    (wantsSummarySection?.targetPercent ?? 0) + (bigWantsSummarySection?.targetPercent ?? 0);
  const incomeYearTotal = incomeMonthTotals.reduce((total, monthTotal) => total + monthTotal, 0);
  const savingsYearTotal = savingsMonthTotals.reduce((total, monthTotal) => total + monthTotal, 0);
  const activeSheetLabel =
    selectedSheet === 'summary' ? 'Year Summary' : `${MONTHS[selectedMonth - 1]} ${selectedYear}`;
  const previousYear = selectedYear - 1;
  const nextYear = selectedYear + 1;
  const needsSection = needsSummarySection;
  const needsBudgetCents =
    needsSection?.categories.reduce(
      (total, category) => total + getCategoryBudgetCents(category, categoryBudgetPeriods, selectedYear, selectedMonth),
      0
    ) ?? 0;
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
            {selectedSheet !== 'summary' ? (
              <FunMoneyAdjustmentDialog
                categories={rolloverCategories}
                adjustments={currentMonthAdjustments}
                monthStart={startDate}
                monthEnd={endDate}
              />
            ) : null}
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
            <Table size="small" sx={{ minWidth: 1710, tableLayout: 'fixed', borderCollapse: 'collapse' }}>
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
                <TableRow>
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#a9c7c9', fontWeight: 700 }}>Balances</TableCell>
                  {MONTHS.map((month) => (
                    <TableCell key={`balances:${month}`} sx={{ ...getCellBorderSx(), bgcolor: '#a9c7c9' }} />
                  ))}
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#a9c7c9' }} />
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#a9c7c9' }} />
                </TableRow>
                {summaryBalanceRows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#d0e0e3' }}>{row.label}</TableCell>
                    {row.values.map((value, monthIndex) => (
                      <TableCell key={`${row.label}:${MONTHS[monthIndex]}`} align="right" sx={getCellBorderSx()}>
                        {formatCurrency(value)}
                      </TableCell>
                    ))}
                    <TableCell align="center" sx={{ ...getCellBorderSx(), fontWeight: 700 }}>---</TableCell>
                    <TableCell align="right" sx={getCellBorderSx()}>
                      {formatCurrency(getNonZeroAverage(row.values))}
                    </TableCell>
                  </TableRow>
                ))}
                {summaryExpenseSections.map((section) => {
                  const isBigWants = section.id === bigWantsSummarySection?.id;
                  const sectionMonthTotals = MONTHS.map((_month, monthIndex) => {
                    const monthSection = sectionsByMonth[monthIndex].find(
                      (candidate) => candidate.id === section.id
                    );
                    if (!monthSection) {
                      return 0;
                    }

                    return getSectionMonthTotal(monthSection, spendingByCategoryMonth, monthIndex + 1);
                  });
                  const sectionTotal = sectionMonthTotals.reduce((total, monthTotal) => total + monthTotal, 0);
                  const formatSectionAmount = (amountCents: number) =>
                    formatSheetAmount(amountCents, section.role);
                  const sectionPercentageSign = -1;

                  return (
                    <Fragment key={section.id}>
                      <TableRow>
                        <TableCell sx={{ ...getCellBorderSx(), bgcolor: section.headerColor, fontWeight: 700 }}>
                          {getSummarySectionLabel(section)}
                        </TableCell>
                        {sectionMonthTotals.map((monthTotal, monthIndex) => (
                          <TableCell
                            key={`${section.id}:${monthIndex}`}
                            align="right"
                            sx={{ ...getCellBorderSx(), bgcolor: section.headerColor }}
                          >
                            {formatSectionAmount(monthTotal)}
                          </TableCell>
                        ))}
                        <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: section.headerColor, fontWeight: 700 }}>
                          {formatSectionAmount(sectionTotal)}
                        </TableCell>
                        <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: section.headerColor, fontWeight: 700 }}>
                          {formatSectionAmount(getNonZeroAverage(sectionMonthTotals))}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ ...getCellBorderSx(), bgcolor: section.headerColor }} />
                        {sectionMonthTotals.map((monthTotal, monthIndex) => (
                          <TableCell
                            key={`${section.id}:income-percent:${monthIndex}`}
                            align="right"
                            sx={{ ...getCellBorderSx(), bgcolor: section.headerColor }}
                          >
                            {formatIncomePercentage(
                              monthTotal,
                              incomeMonthTotals[monthIndex] ?? 0,
                              sectionPercentageSign,
                              '0.00%'
                            )}
                          </TableCell>
                        ))}
                        <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: section.headerColor }}>
                          {formatIncomePercentage(sectionTotal, incomeYearTotal, sectionPercentageSign)}
                        </TableCell>
                        <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: section.headerColor }}>
                          {getAverageIncomePercentage(sectionMonthTotals, incomeMonthTotals, sectionPercentageSign)}
                        </TableCell>
                      </TableRow>
                      {isBigWants ? section.categories.map((category) => {
                        const monthlyActuals = MONTHS.map((_month, monthIndex) =>
                          getActualCents(spendingByCategoryMonth, category.id, monthIndex + 1)
                        );
                        const rowTotal = monthlyActuals.reduce((total, actualCents) => total + actualCents, 0);
                        const hasEntries = monthlyActuals.some((actualCents) => actualCents !== 0);

                        return (
                          <TableRow key={category.id}>
                            <TableCell sx={{ ...getCellBorderSx(), bgcolor: section.color }}>
                              {getSheetCategoryName(category, section)}
                            </TableCell>
                            {monthlyActuals.map((actualCents, monthIndex) => (
                              <TableCell
                                key={`${category.id}:${MONTHS[monthIndex]}`}
                                align="right"
                                sx={getCellBorderSx()}
                              >
                                {formatSheetExpense(actualCents)}
                              </TableCell>
                            ))}
                            <TableCell align="right" sx={getCellBorderSx()}>
                              {formatSheetExpense(rowTotal)}
                            </TableCell>
                            <TableCell align="right" sx={getCellBorderSx()}>
                              {hasEntries ? formatSheetExpense(getNonZeroAverage(monthlyActuals)) : 'No entries.'}
                            </TableCell>
                          </TableRow>
                        );
                      }) : section.categories.map((category) => {
                        const monthlyActuals = MONTHS.map((_month, monthIndex) =>
                          getActualCents(spendingByCategoryMonth, category.id, monthIndex + 1)
                        );
                        const monthlyBudgets = MONTHS.map((_month, monthIndex) =>
                          getCategoryBudgetCents(category, categoryBudgetPeriods, selectedYear, monthIndex + 1)
                        );
                        const rowTotal = getYearRowTotal(spendingByCategoryMonth, category.id);
                        return (
                          <TableRow key={category.id}>
                            <TableCell sx={{ ...getCellBorderSx(), bgcolor: section.color }}>
                              {getSheetCategoryName(category, section)}
                            </TableCell>
                            {MONTHS.map((month, monthIndex) => {
                              const actualCents = getActualCents(spendingByCategoryMonth, category.id, monthIndex + 1);
                              const budgetCents = getCategoryBudgetCents(
                                category,
                                categoryBudgetPeriods,
                                selectedYear,
                                monthIndex + 1
                              );
                              const varianceCents = getExpenseVarianceCents(actualCents, budgetCents);
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
                            {(() => {
                              const averageActualCents = getNonZeroAverage(monthlyActuals);
                              const averageVarianceCents = getAverageExpenseVarianceCents(monthlyActuals, monthlyBudgets);

                              return (
                                <TableCell
                                  align="right"
                                  sx={{
                                    ...getCellBorderSx(),
                                    bgcolor: section.role === 'expense' && averageVarianceCents < 0 ? '#f4cccc' : '#fff',
                                    whiteSpace: 'pre-line',
                                  }}
                                >
                                  {section.role === 'expense'
                                    ? `${formatSheetExpense(averageActualCents)}\n${formatSheetVariance(averageVarianceCents)}`
                                    : formatSheetAmount(averageActualCents, section.role)}
                                </TableCell>
                              );
                            })()}
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  );
                })}
                {wantsSummarySection || bigWantsSummarySection ? (
                  <Fragment>
                    <TableRow>
                      <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#d5a6bd', fontWeight: 700 }}>
                        Wants Totals{wantsTargetPercent ? ` (${wantsTargetPercent}%)` : ''}
                      </TableCell>
                      {wantsTotalsMonthTotals.map((monthTotal, monthIndex) => (
                        <TableCell key={`wants-total:${MONTHS[monthIndex]}`} align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d5a6bd' }}>
                          {formatCurrency(monthTotal)}
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d5a6bd' }}>
                        {formatCurrency(wantsTotalsMonthTotals.reduce((total, value) => total + value, 0))}
                      </TableCell>
                      <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d5a6bd' }}>
                        {formatCurrency(getNonZeroAverage(wantsTotalsMonthTotals))}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#d5a6bd' }} />
                      {wantsTotalsMonthTotals.map((monthTotal, monthIndex) => (
                        <TableCell key={`wants-total-percent:${MONTHS[monthIndex]}`} align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d5a6bd' }}>
                          {formatIncomePercentage(monthTotal, incomeMonthTotals[monthIndex] ?? 0)}
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d5a6bd' }}>
                        {formatIncomePercentage(
                          wantsTotalsMonthTotals.reduce((total, value) => total + value, 0),
                          incomeYearTotal,
                          1
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#d5a6bd' }}>
                        {getAverageIncomePercentage(wantsTotalsMonthTotals, incomeMonthTotals)}
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ) : null}
                <TableRow>
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#b4a7d6', fontWeight: 700 }}>
                    {incomeSections[0]?.name ?? 'Income'}
                  </TableCell>
                  {MONTHS.map((month) => (
                    <TableCell key={`income-header:${month}`} sx={{ ...getCellBorderSx(), bgcolor: '#d9d2e9' }} />
                  ))}
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#d9d2e9' }} />
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#d9d2e9' }} />
                </TableRow>
                <TableRow>
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#d9d2e9' }}>Transfers</TableCell>
                  {incomeMonthTotals.map((monthTotal, monthIndex) => (
                    <TableCell key={`income:${MONTHS[monthIndex]}`} align="right" sx={getCellBorderSx()}>
                      {formatCurrency(monthTotal)}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={getCellBorderSx()}>
                    {formatCurrency(incomeYearTotal)}
                  </TableCell>
                  <TableCell align="right" sx={getCellBorderSx()}>
                    {formatCurrency(getNonZeroAverage(incomeMonthTotals))}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#ffe599', fontWeight: 700 }}>
                    {savingsSections[0] ? getSummarySectionLabel(savingsSections[0]) : 'Savings'}
                  </TableCell>
                  {savingsMonthTotals.map((monthTotal, monthIndex) => {
                    const incomeTotal = incomeMonthTotals[monthIndex] ?? 0;
                    return (
                      <TableCell key={`savings-rate:${MONTHS[monthIndex]}`} align="right" sx={{ ...getCellBorderSx(), bgcolor: '#fff2cc' }}>
                        {formatSavingsRate(monthTotal, incomeTotal)}
                      </TableCell>
                    );
                  })}
                  <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#fff2cc', fontWeight: 700 }}>
                    {incomeYearTotal
                      ? `${((savingsYearTotal / incomeYearTotal) * 100).toFixed(2)}%`
                      : 'No entries.'}
                  </TableCell>
                  <TableCell align="right" sx={{ ...getCellBorderSx(), bgcolor: '#fff2cc', fontWeight: 700 }}>
                    {getAverageIncomePercentage(savingsMonthTotals, incomeMonthTotals)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#fff2cc' }}>Transfers</TableCell>
                  {savingsMonthTotals.map((monthTotal, monthIndex) => (
                    <TableCell key={`savings:${MONTHS[monthIndex]}`} align="right" sx={getCellBorderSx()}>
                      {formatCurrency(monthTotal)}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={getCellBorderSx()}>
                    {formatCurrency(savingsYearTotal)}
                  </TableCell>
                  <TableCell align="right" sx={getCellBorderSx()}>
                    {formatCurrency(getNonZeroAverage(savingsMonthTotals))}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#93c47d', fontWeight: 700 }}>Money Numbers</TableCell>
                  {MONTHS.map((month) => (
                    <TableCell key={`money-header:${month}`} sx={{ ...getCellBorderSx(), bgcolor: '#d9ead3' }} />
                  ))}
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#d9ead3' }} />
                  <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#d9ead3' }} />
                </TableRow>
                {[
                  { label: 'Total Spent (Non-Big)', values: totalSpentNonBigMonthTotals, signed: true },
                  { label: 'Cash Flow (Non-Big)', values: cashFlowNonBigMonthTotals, cashFlow: true },
                  { label: 'Total Spent', values: totalSpentMonthTotals, signed: true },
                  { label: 'Cash Flow', values: cashFlowMonthTotals, cashFlow: true },
                ].map((row) => {
                  const total = row.values.reduce((sum, value) => sum + value, 0);
                  const average = getNonZeroAverage(row.values);
                  return (
                    <TableRow key={row.label}>
                      <TableCell sx={{ ...getCellBorderSx(), bgcolor: '#b6d7a8', fontWeight: 700 }}>{row.label}</TableCell>
                      {row.values.map((value, monthIndex) => (
                        <TableCell key={`${row.label}:${MONTHS[monthIndex]}`} align="right" sx={getCellBorderSx()}>
                          {row.cashFlow || row.signed ? formatCurrency(value) : formatSheetExpense(value)}
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={getCellBorderSx()}>
                        {row.cashFlow || row.signed ? formatCurrency(total) : formatSheetExpense(total)}
                      </TableCell>
                      <TableCell align="right" sx={getCellBorderSx()}>
                        {row.cashFlow || row.signed ? formatCurrency(average) : formatSheetExpense(average)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <TableContainer
            sx={{
              overflowX: 'auto',
              overflowY: 'auto',
              bgcolor: '#fff',
              height: { xs: 'calc(100vh - 190px)', sm: 'calc(100vh - 140px)' },
              minHeight: 520,
              overscrollBehavior: 'contain',
              scrollbarGutter: 'stable',
            }}
          >
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
                        sx={{
                          ...getCellBorderSx(),
                          ...getStickyCellSx('top', 0, 4),
                          bgcolor: section.headerColor,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {section.name}
                      </TableCell>
                      {section.id === needsSection?.id ? (
                        <TableCell
                          align="center"
                          rowSpan={2}
                          sx={{
                            ...getCellBorderSx(),
                            ...getStickyCellSx('top', 0, 4),
                            bgcolor: '#a9c7c9',
                            fontWeight: 700,
                          }}
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
                        <TableCell
                          key={category.id}
                          sx={{
                            ...getCellBorderSx(),
                            ...getStickyCellSx('top', MONTHLY_STICKY_ROW_HEIGHT, 4),
                            bgcolor: section.color,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {getSheetCategoryName(category, section)}
                          {rolloverBalanceByCategoryId.get(category.id)?.active ? ' ↻' : ''}
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
                          sx={{
                            ...getCellBorderSx(),
                            ...getStickyCellSx('top', MONTHLY_STICKY_ROW_HEIGHT * 2, 4),
                            bgcolor: '#d9d9d9',
                            fontWeight: 700,
                          }}
                        >
                          {formatCurrency(bigWantsCapacityCents)}
                        </TableCell>
                      ) : (
                        section.categories.map((category) => {
                          const rolloverBalance = rolloverBalanceByCategoryId.get(category.id);
                          const displayedBudgetCents =
                            rolloverBalance?.active
                              ? rolloverBalance.availableBeforeSpendCents
                              : getCategoryBudgetCents(
                                  category,
                                  categoryBudgetPeriods,
                                  selectedYear,
                                  selectedMonth
                                );

                          return (
                            <TableCell
                              key={category.id}
                              align="right"
                              sx={{
                                ...getCellBorderSx(),
                                ...getStickyCellSx('top', MONTHLY_STICKY_ROW_HEIGHT * 2, 4),
                                bgcolor: '#d9d9d9',
                              }}
                            >
                              {section.role === 'expense' ? (
                                rolloverBalance?.active ? (
                                  <Tooltip
                                    title={
                                      <Box sx={{ whiteSpace: 'pre-line' }}>
                                        {`Opening balance: ${formatCurrency(rolloverBalance.openingBalanceCents)}\nMonthly allotment: ${formatCurrency(rolloverBalance.monthlyAllotmentCents)}\nCredits: ${formatCurrency(rolloverBalance.adjustmentsThisMonthCents)}`}
                                      </Box>
                                    }
                                    arrow
                                  >
                                    <Box sx={{ cursor: 'default' }}>{formatCurrency(displayedBudgetCents)}</Box>
                                  </Tooltip>
                                ) : (
                                  formatCurrency(displayedBudgetCents)
                                )
                              ) : null}
                            </TableCell>
                          );
                        })
                      )}
                      {section.id === needsSection?.id ? (
                        <TableCell
                          align="right"
                          sx={{
                            ...getCellBorderSx(),
                            ...getStickyCellSx('top', MONTHLY_STICKY_ROW_HEIGHT * 2, 4),
                            bgcolor: '#d9d9d9',
                            fontWeight: 700,
                          }}
                        >
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
                          const lines = monthlyDisplayLinesByCategoryId.get(category.id) ?? [];
                          const line = lines[rowIndex];
                          return (
                            <TableCell
                              key={category.id}
                              align="right"
                              sx={{
                                ...getCellBorderSx(),
                                bgcolor: line
                                  ? section.role === 'expense' && line.amountCents >= 0
                                    ? '#f4cccc'
                                    : '#d9ead3'
                                  : '#fff',
                                color:
                                  line && section.role === 'expense' && line.amountCents < 0
                                    ? '#137333'
                                    : line
                                      ? getDisplayLineFontColor(line)
                                      : '#000',
                              }}
                            >
                              {line ? (
                                <Tooltip
                                  title={
                                    <Box sx={{ whiteSpace: 'pre-line' }}>
                                      {getMonthlyDisplayLineTooltip(line, section.role)}
                                    </Box>
                                  }
                                  arrow
                                  placement="right"
                                >
                                  <Box sx={{ cursor: 'default', whiteSpace: 'nowrap' }}>
                                    {formatSheetAmount(line.amountCents, section.role)}
                                    {line.lines.length > 1 ? (
                                      <Box component="span" sx={{ ml: 0.5, fontSize: 10, fontWeight: 700 }}>
                                        ×{line.lines.length}
                                      </Box>
                                    ) : null}
                                  </Box>
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
                          (categoryTotal, line) =>
                            categoryTotal + getDisplayActualCents(line.amount_cents, section.role),
                          0
                        );
                        return (
                          <TableCell
                            key={category.id}
                            align="right"
                            sx={{
                              ...getCellBorderSx(),
                              ...getStickyCellSx('bottom', MONTHLY_STICKY_ROW_HEIGHT, 3),
                              bgcolor:
                                section.role === 'expense' && total >= 0 ? '#f4cccc' : '#d9ead3',
                              color: section.role === 'expense' && total < 0 ? '#137333' : '#000',
                              borderTop: '3px solid #000',
                              boxShadow: '0 -3px 5px rgba(0, 0, 0, 0.18)',
                              fontWeight: 700,
                            }}
                          >
                            {formatSheetAmount(total, section.role)}
                          </TableCell>
                        );
                      })}
                      {section.id === needsSection?.id ? (
                        <TableCell
                          align="right"
                          sx={{
                            ...getCellBorderSx(),
                            ...getStickyCellSx('bottom', MONTHLY_STICKY_ROW_HEIGHT, 3),
                            bgcolor: '#f4cccc',
                            borderTop: '3px solid #000',
                            boxShadow: '0 -3px 5px rgba(0, 0, 0, 0.18)',
                            fontWeight: 700,
                          }}
                        >
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
                          (categoryTotal, line) =>
                            categoryTotal + getDisplayActualCents(line.amount_cents, section.role),
                          0
                        );
                        const remaining =
                          rolloverBalanceByCategoryId.get(category.id)?.active
                            ? rolloverBalanceByCategoryId.get(category.id)?.endingBalanceCents ?? 0
                            : getCategoryBudgetCents(
                                category,
                                categoryBudgetPeriods,
                                selectedYear,
                                selectedMonth
                              ) - total;
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
                              ...getStickyCellSx('bottom', 0, 3),
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
                          sx={{
                            ...getCellBorderSx(),
                            ...getStickyCellSx('bottom', 0, 3),
                            bgcolor: needsRemainingCents >= 0 ? '#d9ead3' : '#f4cccc',
                            fontWeight: 700,
                          }}
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
