import { NextRequest, NextResponse } from 'next/server';
import { resolveCategoryLayout } from '@/lib/categoryLayouts';
import { resolveCategoryBudgetAmount } from '@/lib/constantPeriods';
import {
  parseGoogleSheetsBudgetWorkbook,
  type ParsedBudgetCategory,
  type ParsedBudgetLine,
} from '@/lib/googleSheetsBudgetImport';
import { getCurrentHousehold } from '@/lib/households';
import { getImportRestorationMonths } from '@/lib/importPeriods';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { Category, CategoryBudgetPeriod, CategoryLayoutPeriod } from '@/types/database';

interface CategoryInput {
  name: string;
  groupName: string;
  groupKey: string;
  color: string;
  isIncome: boolean;
  defaultMonthlyBudgetCents: number;
  sortOrder: number;
}

function getCategoryDbName(
  category: Pick<ParsedBudgetCategory, 'categoryName' | 'groupName'>,
  duplicateCategoryNames: Set<string>
): string {
  return duplicateCategoryNames.has(category.categoryName)
    ? `${category.groupName} ${category.categoryName}`
    : category.categoryName;
}

function parseSelectedSheets(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((sheet): sheet is string => typeof sheet === 'string') : [];
  } catch {
    return [];
  }
}

function normalizeSource(value: FormDataEntryValue | null, fileName: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return fileName.replace(/\.xlsx$/i, '').trim() || 'google_sheets_budget_import';
}

function uniqueByName<T extends { name: string }>(values: T[]): T[] {
  const byName = new Map<string, T>();
  values.forEach((value) => {
    if (!byName.has(value.name)) {
      byName.set(value.name, value);
    }
  });
  return Array.from(byName.values());
}

function uniqueByKey<T>(values: T[], getKey: (value: T) => string): T[] {
  const byKey = new Map<string, T>();
  values.forEach((value) => {
    const key = getKey(value);
    if (!byKey.has(key)) {
      byKey.set(key, value);
    }
  });
  return Array.from(byKey.values());
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before importing budget history.' }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const yearValue = Number(formData.get('year'));
  const selectedSheets = parseSelectedSheets(formData.get('selectedSheets'));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Upload an .xlsx file.' }, { status: 400 });
  }

  if (!Number.isInteger(yearValue) || yearValue < 2000 || yearValue > 2100) {
    return NextResponse.json({ error: 'Choose a valid import year.' }, { status: 400 });
  }

  if (selectedSheets.length === 0) {
    return NextResponse.json({ error: 'Select at least one sheet to import.' }, { status: 400 });
  }

  const source = normalizeSource(formData.get('source'), file.name);

  try {
    const workbook = await parseGoogleSheetsBudgetWorkbook(await file.arrayBuffer(), yearValue);
    const lines = selectedSheets.flatMap((sheetName) => workbook.linesBySheet.get(sheetName) ?? []);
    const importedCategories = selectedSheets.flatMap(
      (sheetName) => workbook.categoriesBySheet.get(sheetName) ?? []
    );

    if (importedCategories.length === 0) {
      return NextResponse.json(
        { error: 'The selected sheets do not contain importable budget categories.' },
        { status: 400 }
      );
    }

    const groupsByCategoryName = new Map<string, Set<string>>();
    importedCategories.forEach((category) => {
      groupsByCategoryName.set(
        category.categoryName,
        groupsByCategoryName.get(category.categoryName) ?? new Set()
      );
      groupsByCategoryName.get(category.categoryName)?.add(category.groupName);
    });
    const duplicateCategoryNames = new Set(
      Array.from(groupsByCategoryName.entries())
        .filter(([_categoryName, groupNames]) => groupNames.size > 1)
        .map(([categoryName]) => categoryName)
    );

    const groupInputs = uniqueByName(
      importedCategories.map((category) => ({
        name: category.groupName,
        groupKey: category.groupKey,
        color: category.categoryColor,
        isIncome: category.groupKey === 'income',
      }))
    );

    const [
      { data: preImportCategoryRows, error: preImportCategoryError },
      { data: preImportLayoutRows, error: preImportLayoutError },
      { data: preImportBudgetRows, error: preImportBudgetError },
    ] = await Promise.all([
      supabase.from('categories').select('*').eq('household_id', household.id),
      supabase.from('category_layout_periods').select('*').eq('household_id', household.id),
      supabase.from('category_budget_periods').select('*').eq('household_id', household.id),
    ]);

    const preImportError = preImportCategoryError ?? preImportLayoutError ?? preImportBudgetError;
    if (preImportError) {
      return NextResponse.json({ error: preImportError.message }, { status: 500 });
    }

    const preImportCategories = (preImportCategoryRows ?? []) as Category[];
    const preImportLayouts = (preImportLayoutRows ?? []) as CategoryLayoutPeriod[];
    const preImportBudgets = (preImportBudgetRows ?? []) as CategoryBudgetPeriod[];
    const preExistingCategoryIds = new Set(preImportCategories.map((category) => category.id));
    const existingGroupNames = new Set(
      preImportCategories.filter((category) => category.is_group).map((group) => group.name)
    );
    const groupsToInsert = groupInputs.filter((group) => !existingGroupNames.has(group.name));
    if (groupsToInsert.length > 0) {
      const { error: groupInsertError } = await supabase.from('categories').insert(
        groupsToInsert.map((group, index) => ({
          user_id: user.id,
          household_id: household.id,
          name: group.name,
          color: group.color,
          group_key: group.groupKey,
          is_group: true,
          is_income: group.isIncome,
          sort_order: (index + 1) * 100,
        }))
      );

      if (groupInsertError) {
        return NextResponse.json({ error: groupInsertError.message }, { status: 500 });
      }
    }

    const { data: categoryRowsAfterGroups, error: groupFetchError } = await supabase
      .from('categories')
      .select('*')
      .eq('household_id', household.id);

    if (groupFetchError) {
      return NextResponse.json({ error: groupFetchError.message }, { status: 500 });
    }

    const groupByName = new Map(
      ((categoryRowsAfterGroups ?? []) as Category[])
        .filter((category) => category.is_group)
        .map((group) => [group.name, group])
    );
    const categoryInputs = uniqueByName<CategoryInput>(
      importedCategories.map((category) => ({
        name: getCategoryDbName(category, duplicateCategoryNames),
        groupName: category.groupName,
        groupKey: category.groupKey,
        color: category.categoryColor,
        isIncome: category.isIncome,
        defaultMonthlyBudgetCents: category.defaultMonthlyBudgetCents,
        sortOrder: category.sortOrder,
      }))
    );

    const existingCategoryNames = new Set(
      ((categoryRowsAfterGroups ?? []) as Category[])
        .filter((category) => !category.is_group)
        .map((category) => category.name)
    );
    const categoriesToInsert = categoryInputs.filter((category) => !existingCategoryNames.has(category.name));
    if (categoriesToInsert.length > 0) {
      const { error: categoryInsertError } = await supabase.from('categories').insert(
        categoriesToInsert.map((category, index) => ({
          user_id: user.id,
          household_id: household.id,
          name: category.name,
          color: category.color,
          parent_category_id: groupByName.get(category.groupName)?.id ?? null,
          group_key: category.groupKey,
          default_monthly_budget_cents: category.defaultMonthlyBudgetCents,
          rollover_enabled:
            category.groupKey.toLowerCase() === 'wants' &&
            !category.name.toLowerCase().includes('entertainment'),
          rollover_start_date:
            category.groupKey.toLowerCase() === 'wants' &&
            !category.name.toLowerCase().includes('entertainment')
              ? `${yearValue}-01-01`
              : null,
          is_income: category.isIncome,
          is_group: false,
          sort_order: 1000 + index * 10,
        }))
      );

      if (categoryInsertError) {
        return NextResponse.json({ error: categoryInsertError.message }, { status: 500 });
      }
    }

    const { data: allCategoryRows, error: categoryFetchError } = await supabase
      .from('categories')
      .select('*')
      .eq('household_id', household.id);

    if (categoryFetchError) {
      return NextResponse.json({ error: categoryFetchError.message }, { status: 500 });
    }

    const allCategories = (allCategoryRows ?? []) as Category[];
    const categoryByName = new Map(
      allCategories
        .filter((category) => !category.is_group)
        .map((category) => [category.name, category])
    );
    const selectedSnapshots = uniqueByKey(
      importedCategories.map((category) => ({
        ...category,
        databaseName: getCategoryDbName(category, duplicateCategoryNames),
      })),
      (category) => `${category.year}:${category.month}:${category.databaseName}`
    );
    const importedMonths = Array.from(new Set(selectedSnapshots.map((category) => category.month))).sort(
      (first, second) => first - second
    );
    const restorationMonths = getImportRestorationMonths(
      importedMonths.map((month) => ({ year: yearValue, month }))
    );
    const snapshotsByMonth = new Map(
      importedMonths.map((month) => [
        month,
        selectedSnapshots.filter((category) => category.month === month),
      ])
    );
    const selectedLayoutRows = importedMonths.flatMap((month) => {
      const monthSnapshots = snapshotsByMonth.get(month) ?? [];
      const snapshotByCategoryName = new Map(
        monthSnapshots.map((snapshot) => [snapshot.databaseName, snapshot])
      );
      const importedGroupNames = Array.from(
        new Set(monthSnapshots.map((snapshot) => snapshot.groupName))
      );
      const groupOrderByName = new Map(
        importedGroupNames.map((groupName, index) => [groupName, (index + 1) * 100])
      );
      const preImportLayoutByCategoryId = new Map(
        resolveCategoryLayout(preImportCategories, preImportLayouts, yearValue, month).map((layout) => [
          layout.category.id,
          layout,
        ])
      );

      return allCategories.map((category) => {
        const fallback = preImportLayoutByCategoryId.get(category.id);
        const snapshot = category.is_group ? null : snapshotByCategoryName.get(category.name);
        const isImportedGroup = category.is_group && importedGroupNames.includes(category.name);
        const importedParent = snapshot ? groupByName.get(snapshot.groupName) : null;

        return {
          household_id: household.id,
          category_id: category.id,
          parent_category_id: snapshot
            ? importedParent?.id ?? fallback?.parentCategoryId ?? category.parent_category_id
            : fallback?.parentCategoryId ?? category.parent_category_id,
          start_year: yearValue,
          start_month: month,
          end_year: yearValue,
          end_month: month,
          sort_order: snapshot
            ? snapshot.sortOrder
            : isImportedGroup
              ? groupOrderByName.get(category.name) ?? fallback?.sortOrder ?? category.sort_order ?? 0
              : fallback?.sortOrder ?? category.sort_order ?? 0,
          is_visible: Boolean(snapshot || isImportedGroup),
          notes: `Imported layout from ${source}`,
        };
      });
    });
    const restorationLayoutRows = restorationMonths.flatMap((restorationMonth) => {
      const preImportLayoutByCategoryId = new Map(
        resolveCategoryLayout(
          preImportCategories,
          preImportLayouts,
          restorationMonth.year,
          restorationMonth.month
        ).map((layout) => [layout.category.id, layout])
      );

      return allCategories.map((category) => {
        const fallback = preImportLayoutByCategoryId.get(category.id);
        const exactPeriod =
          fallback?.period?.start_year === restorationMonth.year &&
          fallback.period.start_month === restorationMonth.month
            ? fallback.period
            : null;

        return {
          household_id: household.id,
          category_id: category.id,
          parent_category_id: fallback?.parentCategoryId ?? category.parent_category_id,
          start_year: restorationMonth.year,
          start_month: restorationMonth.month,
          end_year: exactPeriod?.end_year ?? null,
          end_month: exactPeriod?.end_month ?? null,
          sort_order: fallback?.sortOrder ?? category.sort_order ?? 0,
          is_visible: preExistingCategoryIds.has(category.id) ? fallback?.isVisible ?? true : false,
          notes: exactPeriod?.notes ?? `Restored layout after ${source} import`,
        };
      });
    });
    const layoutRows = [...selectedLayoutRows, ...restorationLayoutRows];

    if (layoutRows.length > 0) {
      const { error: layoutUpsertError } = await supabase.from('category_layout_periods').upsert(
        layoutRows,
        { onConflict: 'household_id,category_id,start_year,start_month' }
      );

      if (layoutUpsertError) {
        return NextResponse.json({ error: layoutUpsertError.message }, { status: 500 });
      }
    }

    const selectedBudgetRows = selectedSnapshots.flatMap((snapshot) => {
      const category = categoryByName.get(snapshot.databaseName);
      if (!category) {
        return [];
      }

      return [{
        household_id: household.id,
        category_id: category.id,
        year: yearValue,
        start_month: snapshot.month,
        amount_cents: snapshot.defaultMonthlyBudgetCents,
        notes: `Imported budget from ${source}`,
      }];
    });
    const preImportCategoryById = new Map(preImportCategories.map((category) => [category.id, category]));
    const restorationBudgetRows = restorationMonths.flatMap((restorationMonth) =>
      allCategories
        .filter((category) => !category.is_group)
        .map((category) => {
          const preImportCategory = preImportCategoryById.get(category.id);
          const amountCents = preImportCategory
            ? resolveCategoryBudgetAmount(
                category.id,
                preImportCategory.default_monthly_budget_cents,
                preImportBudgets,
                restorationMonth.year,
                restorationMonth.month
              ).amount_cents
            : 0;

          return {
            household_id: household.id,
            category_id: category.id,
            year: restorationMonth.year,
            start_month: restorationMonth.month,
            amount_cents: amountCents,
            notes: `Restored budget after ${source} import`,
          };
        })
    );
    const budgetPeriodRows = [...selectedBudgetRows, ...restorationBudgetRows];
    if (budgetPeriodRows.length > 0) {
      const { error: budgetPeriodUpsertError } = await supabase.from('category_budget_periods').upsert(budgetPeriodRows, {
        onConflict: 'household_id,category_id,year,start_month',
      });

      if (budgetPeriodUpsertError) {
        return NextResponse.json({ error: budgetPeriodUpsertError.message }, { status: 500 });
      }
    }

    const rows = lines
      .map((line: ParsedBudgetLine) => {
        const category = categoryByName.get(getCategoryDbName(line, duplicateCategoryNames));
        if (!category) {
          return null;
        }

        return {
          user_id: user.id,
          household_id: household.id,
          category_id: category.id,
          source,
          source_sheet: line.source_sheet,
          source_cell: line.source_cell,
          year: line.year,
          month: line.month,
          date: line.date,
          amount_cents: line.amount_cents,
          description: line.description,
          notes: line.notes,
          raw_comment: line.raw_comment,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length > 0) {
      const { error: lineUpsertError } = await supabase.from('imported_budget_lines').upsert(rows, {
        onConflict: 'household_id,source,source_sheet,source_cell',
      });

      if (lineUpsertError) {
        return NextResponse.json({ error: lineUpsertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      importedCount: rows.length,
      selectedSheets,
      source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to import workbook.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
