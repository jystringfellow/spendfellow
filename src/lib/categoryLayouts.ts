import type { Category, CategoryLayoutPeriod } from '@/types/database';

export interface EffectiveCategoryLayout {
  category: Category;
  parentCategoryId: string | null;
  sortOrder: number;
  isVisible: boolean;
  period: CategoryLayoutPeriod | null;
}

export interface CategoryLayoutRestorationRow {
  category_id: string;
  parent_category_id: string | null;
  start_year: number;
  start_month: number;
  end_year: null;
  end_month: null;
  sort_order: number;
  is_visible: boolean;
  notes: string;
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

export function createCategoryLayoutRestorationRows(
  allCategories: Category[],
  preImportCategories: Category[],
  preImportLayouts: CategoryLayoutPeriod[],
  preExistingCategoryIds: Set<string>,
  year: number,
  month: number,
  notes: string
): CategoryLayoutRestorationRow[] {
  // Finite periods are historical month snapshots and will continue to
  // override this restoration during their own ranges. Restore from only the
  // underlying open-ended timeline so a partial import cannot leak a finite
  // month's column layout into all later months.
  const underlyingLayouts = preImportLayouts.filter(
    (period) => period.end_year === null && period.end_month === null
  );
  const fallbackByCategoryId = new Map(
    resolveCategoryLayout(preImportCategories, underlyingLayouts, year, month).map((layout) => [
      layout.category.id,
      layout,
    ])
  );

  return allCategories.map((category) => {
    const fallback = fallbackByCategoryId.get(category.id);

    return {
      category_id: category.id,
      parent_category_id: fallback?.parentCategoryId ?? category.parent_category_id,
      start_year: year,
      start_month: month,
      end_year: null,
      end_month: null,
      sort_order: fallback?.sortOrder ?? category.sort_order ?? 0,
      is_visible: preExistingCategoryIds.has(category.id) ? fallback?.isVisible ?? true : false,
      notes,
    };
  });
}
