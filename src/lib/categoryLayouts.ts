import type { Category, CategoryLayoutPeriod } from '@/types/database';

export interface EffectiveCategoryLayout {
  category: Category;
  parentCategoryId: string | null;
  sortOrder: number;
  isVisible: boolean;
  period: CategoryLayoutPeriod | null;
}

function periodIndex(year: number, month: number): number {
  return year * 12 + month;
}

function isPeriodEffective(period: CategoryLayoutPeriod, year: number, month: number): boolean {
  const target = periodIndex(year, month);
  const start = periodIndex(period.start_year, period.start_month);
  const end = period.end_year && period.end_month ? periodIndex(period.end_year, period.end_month) : Number.POSITIVE_INFINITY;

  return start <= target && target <= end;
}

export function resolveCategoryLayout(
  categories: Category[],
  periods: CategoryLayoutPeriod[],
  year: number,
  month: number
): EffectiveCategoryLayout[] {
  const periodsByCategoryId = new Map<string, CategoryLayoutPeriod[]>();
  const hasAnyEffectivePeriod = periods.some((period) => isPeriodEffective(period, year, month));

  periods.forEach((period) => {
    periodsByCategoryId.set(period.category_id, [...(periodsByCategoryId.get(period.category_id) ?? []), period]);
  });

  return categories.map((category) => {
    const period =
      periodsByCategoryId
        .get(category.id)
        ?.filter((candidate) => isPeriodEffective(candidate, year, month))
        .sort((first, second) => periodIndex(second.start_year, second.start_month) - periodIndex(first.start_year, first.start_month))[0] ??
      null;

    return {
      category,
      parentCategoryId: period ? period.parent_category_id : category.parent_category_id,
      sortOrder: period ? period.sort_order : category.sort_order ?? 0,
      isVisible: period ? period.is_visible : !hasAnyEffectivePeriod,
      period,
    };
  });
}
