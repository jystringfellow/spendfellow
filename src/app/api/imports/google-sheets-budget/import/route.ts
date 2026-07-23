import { NextRequest, NextResponse } from 'next/server';
import { parseGoogleSheetsBudgetWorkbook, type ParsedBudgetLine } from '@/lib/googleSheetsBudgetImport';
import { getCurrentHousehold } from '@/lib/households';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { Category } from '@/types/database';

interface CategoryInput {
  name: string;
  groupName: string;
  groupKey: string;
  color: string;
  isIncome: boolean;
  defaultMonthlyBudgetCents: number;
  sortOrder: number;
}

function getCategoryDbName(line: Pick<ParsedBudgetLine, 'categoryName' | 'groupName'>, duplicateCategoryNames: Set<string>): string {
  return duplicateCategoryNames.has(line.categoryName) ? `${line.groupName} ${line.categoryName}` : line.categoryName;
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
    const selectedLineGroups = selectedSheets.map((sheetName) => workbook.linesBySheet.get(sheetName) ?? []);
    const lines = selectedLineGroups.flat();

    if (lines.length === 0) {
      return NextResponse.json({ error: 'The selected sheets do not contain importable budget lines.' }, { status: 400 });
    }

    const groupsByCategoryName = new Map<string, Set<string>>();
    lines.forEach((line) => {
      groupsByCategoryName.set(line.categoryName, groupsByCategoryName.get(line.categoryName) ?? new Set());
      groupsByCategoryName.get(line.categoryName)?.add(line.groupName);
    });
    const duplicateCategoryNames = new Set(
      Array.from(groupsByCategoryName.entries())
        .filter(([_categoryName, groupNames]) => groupNames.size > 1)
        .map(([categoryName]) => categoryName)
    );

    const groupInputs = uniqueByName(
      lines.map((line) => ({
        name: line.groupName,
        groupKey: line.groupKey,
        color: line.categoryColor,
        isIncome: line.groupKey === 'income',
      }))
    );

    const { data: existingGroupRows, error: existingGroupFetchError } = await supabase
      .from('categories')
      .select('*')
      .eq('household_id', household.id)
      .in(
        'name',
        groupInputs.map((group) => group.name)
      );

    if (existingGroupFetchError) {
      return NextResponse.json({ error: existingGroupFetchError.message }, { status: 500 });
    }

    const existingGroupNames = new Set(((existingGroupRows ?? []) as Category[]).map((group) => group.name));
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

    const { data: groupRows, error: groupFetchError } = await supabase
      .from('categories')
      .select('*')
      .eq('household_id', household.id)
      .in(
        'name',
        groupInputs.map((group) => group.name)
      );

    if (groupFetchError) {
      return NextResponse.json({ error: groupFetchError.message }, { status: 500 });
    }

    const groupByName = new Map(((groupRows ?? []) as Category[]).map((group) => [group.name, group]));
    const categoryInputs = uniqueByName<CategoryInput>(
      lines.map((line) => ({
        name: getCategoryDbName(line, duplicateCategoryNames),
        groupName: line.groupName,
        groupKey: line.groupKey,
        color: line.categoryColor,
        isIncome: line.isIncome,
        defaultMonthlyBudgetCents: line.defaultMonthlyBudgetCents,
        sortOrder: line.sortOrder,
      }))
    );

    const { data: existingCategoryRows, error: existingCategoryFetchError } = await supabase
      .from('categories')
      .select('*')
      .eq('household_id', household.id)
      .in(
        'name',
        categoryInputs.map((category) => category.name)
      );

    if (existingCategoryFetchError) {
      return NextResponse.json({ error: existingCategoryFetchError.message }, { status: 500 });
    }

    const existingCategoryNames = new Set(((existingCategoryRows ?? []) as Category[]).map((category) => category.name));
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

    const { data: categoryRows, error: categoryFetchError } = await supabase
      .from('categories')
      .select('*')
      .eq('household_id', household.id)
      .in(
        'name',
        categoryInputs.map((category) => category.name)
      );

    if (categoryFetchError) {
      return NextResponse.json({ error: categoryFetchError.message }, { status: 500 });
    }

    const categoryByName = new Map(((categoryRows ?? []) as Category[]).map((category) => [category.name, category]));
    const importedMonths = Array.from(new Set(lines.map((line) => line.month))).sort((first, second) => first - second);
    const groupLayoutRows = groupInputs.flatMap((group, index) => {
      const category = groupByName.get(group.name);
      if (!category) {
        return [];
      }

      return importedMonths.map((month) => ({
        household_id: household.id,
        category_id: category.id,
        parent_category_id: null,
        start_year: yearValue,
        start_month: month,
        end_year: yearValue,
        end_month: month,
        sort_order: (index + 1) * 100,
        is_visible: true,
        notes: `Imported layout from ${source}`,
      }));
    });
    const categoryLayoutRows = categoryInputs.flatMap((categoryInput) => {
      const category = categoryByName.get(categoryInput.name);
      const group = groupByName.get(categoryInput.groupName);
      if (!category || !group) {
        return [];
      }

      return importedMonths.map((month) => ({
        household_id: household.id,
        category_id: category.id,
        parent_category_id: group.id,
        start_year: yearValue,
        start_month: month,
        end_year: yearValue,
        end_month: month,
        sort_order: categoryInput.sortOrder,
        is_visible: true,
        notes: `Imported layout from ${source}`,
      }));
    });

    if (groupLayoutRows.length > 0 || categoryLayoutRows.length > 0) {
      const { error: layoutUpsertError } = await supabase.from('category_layout_periods').upsert(
        [...groupLayoutRows, ...categoryLayoutRows],
        { onConflict: 'household_id,category_id,start_year,start_month' }
      );

      if (layoutUpsertError) {
        return NextResponse.json({ error: layoutUpsertError.message }, { status: 500 });
      }
    }

    const budgetPeriodRows = categoryInputs.flatMap((categoryInput) => {
      const category = categoryByName.get(categoryInput.name);
      if (!category || category.is_group) {
        return [];
      }

      return importedMonths.map((month) => ({
        household_id: household.id,
        category_id: category.id,
        year: yearValue,
        start_month: month,
        amount_cents: categoryInput.defaultMonthlyBudgetCents,
        notes: `Imported budget from ${source}`,
      }));
    });

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

    const { error: lineUpsertError } = await supabase.from('imported_budget_lines').upsert(rows, {
      onConflict: 'household_id,source,source_sheet,source_cell',
    });

    if (lineUpsertError) {
      return NextResponse.json({ error: lineUpsertError.message }, { status: 500 });
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
