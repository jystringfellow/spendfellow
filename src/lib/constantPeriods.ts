import type { CategoryBudgetPeriod, RecurringValuePeriod } from '@/types/database';

export interface ResolvedPeriodAmount<TPeriod> {
  amount_cents: number;
  effective_start_month: number | null;
  period: TPeriod | null;
}

export interface DatedPeriod {
  id: string;
  year: number;
  start_month: number;
}

export const monthOptions = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
];

export function getMonthlyPlanningAmountCents(
  amountCents: number,
  billingFrequency: 'monthly' | 'yearly'
): number {
  return billingFrequency === 'yearly' ? Math.round(amountCents / 12) : amountCents;
}

export function clampMonth(month: number): number {
  if (month < 1) {
    return 1;
  }

  if (month > 12) {
    return 12;
  }

  return month;
}

export function getSupersededPeriodIds(
  periods: DatedPeriod[],
  effectiveYear: number,
  effectiveStartMonth: number
): string[] {
  return periods
    .filter(
      (period) =>
        period.year > effectiveYear ||
        (period.year === effectiveYear && period.start_month > effectiveStartMonth)
    )
    .map((period) => period.id);
}

export function resolveCategoryBudgetAmount(
  categoryId: string,
  fallbackAmountCents: number,
  periods: CategoryBudgetPeriod[],
  year: number,
  month: number
): ResolvedPeriodAmount<CategoryBudgetPeriod> {
  const period = periods
    .filter(
      (candidate) =>
        candidate.category_id === categoryId &&
        candidate.year === year &&
        candidate.start_month <= month
    )
    .sort((a, b) => b.start_month - a.start_month)[0];

  return {
    amount_cents: period?.amount_cents ?? fallbackAmountCents,
    effective_start_month: period?.start_month ?? null,
    period: period ?? null,
  };
}

export function resolveRecurringValueAmount(
  recurringValueId: string,
  fallbackAmountCents: number,
  periods: RecurringValuePeriod[],
  year: number,
  month: number
): ResolvedPeriodAmount<RecurringValuePeriod> {
  const period = periods
    .filter(
      (candidate) =>
        candidate.recurring_value_id === recurringValueId &&
        candidate.year === year &&
        candidate.start_month <= month
    )
    .sort((a, b) => b.start_month - a.start_month)[0];

  return {
    amount_cents: period?.amount_cents ?? fallbackAmountCents,
    effective_start_month: period?.start_month ?? null,
    period: period ?? null,
  };
}
