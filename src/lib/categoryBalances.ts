import { resolveCategoryBudgetAmount } from '@/lib/constantPeriods';
import type { Category, CategoryBalanceAdjustment, CategoryBudgetPeriod } from '@/types/database';

export interface CategoryBalanceActivity {
  category_id: string;
  date: string;
  amount_cents: number;
}

export interface RolloverCategoryBalance {
  active: boolean;
  openingBalanceCents: number;
  monthlyAllotmentCents: number;
  adjustmentsThisMonthCents: number;
  availableBeforeSpendCents: number;
  spentThisMonthCents: number;
  endingBalanceCents: number;
}

function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function monthEnd(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function nextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function sumActivity(
  activity: CategoryBalanceActivity[],
  categoryId: string,
  startDate: string,
  endDate: string
): number {
  return activity
    .filter((line) => line.category_id === categoryId && line.date >= startDate && line.date <= endDate)
    .reduce((total, line) => total + Math.abs(line.amount_cents), 0);
}

function sumAdjustments(
  adjustments: CategoryBalanceAdjustment[],
  categoryId: string,
  startDate: string,
  endDate: string
): number {
  return adjustments
    .filter(
      (adjustment) =>
        adjustment.category_id === categoryId &&
        adjustment.status === 'posted' &&
        adjustment.effective_date >= startDate &&
        adjustment.effective_date <= endDate
    )
    .reduce((total, adjustment) => total + adjustment.amount_cents, 0);
}

function sumMonthlyAllotments(
  category: Category,
  periods: CategoryBudgetPeriod[],
  startDate: string,
  endDate: string
): number {
  let cursor = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
  const finalMonth = new Date(`${endDate.slice(0, 7)}-01T00:00:00Z`);
  let total = 0;

  while (cursor <= finalMonth) {
    total += resolveCategoryBudgetAmount(
      category.id,
      category.default_monthly_budget_cents,
      periods,
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1
    ).amount_cents;
    cursor = nextMonth(cursor);
  }

  return total;
}

export function calculateRolloverCategoryBalance(
  category: Category,
  periods: CategoryBudgetPeriod[],
  activity: CategoryBalanceActivity[],
  adjustments: CategoryBalanceAdjustment[],
  year: number,
  month: number
): RolloverCategoryBalance {
  const selectedMonthStart = monthStart(year, month);
  const selectedMonthEnd = monthEnd(year, month);
  const rolloverStartDate = category.rollover_start_date;
  const active = Boolean(
    category.rollover_enabled &&
      rolloverStartDate &&
      rolloverStartDate <= selectedMonthEnd
  );

  if (!active || !rolloverStartDate) {
    return {
      active: false,
      openingBalanceCents: 0,
      monthlyAllotmentCents: 0,
      adjustmentsThisMonthCents: 0,
      availableBeforeSpendCents: 0,
      spentThisMonthCents: 0,
      endingBalanceCents: 0,
    };
  }

  const effectiveStartDate = rolloverStartDate > selectedMonthStart ? rolloverStartDate : selectedMonthStart;
  const monthlyAllotmentCents = sumMonthlyAllotments(
    category,
    periods,
    selectedMonthStart,
    selectedMonthEnd
  );
  const adjustmentsThisMonthCents = sumAdjustments(
    adjustments,
    category.id,
    effectiveStartDate,
    selectedMonthEnd
  );
  const spentThisMonthCents = sumActivity(
    activity,
    category.id,
    effectiveStartDate,
    selectedMonthEnd
  );

  const priorMonthEnd = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
  const hasPriorPeriod = rolloverStartDate <= priorMonthEnd;
  const openingBalanceCents = hasPriorPeriod
    ? sumMonthlyAllotments(category, periods, rolloverStartDate, priorMonthEnd) +
      sumAdjustments(adjustments, category.id, rolloverStartDate, priorMonthEnd) -
      sumActivity(activity, category.id, rolloverStartDate, priorMonthEnd)
    : 0;
  const availableBeforeSpendCents =
    openingBalanceCents + monthlyAllotmentCents + adjustmentsThisMonthCents;

  return {
    active,
    openingBalanceCents,
    monthlyAllotmentCents,
    adjustmentsThisMonthCents,
    availableBeforeSpendCents,
    spentThisMonthCents,
    endingBalanceCents: availableBeforeSpendCents - spentThisMonthCents,
  };
}
