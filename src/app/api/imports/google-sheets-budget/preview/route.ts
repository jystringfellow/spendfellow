import { NextRequest, NextResponse } from 'next/server';
import { parseGoogleSheetsBudgetWorkbook } from '@/lib/googleSheetsBudgetImport';
import {
  getDuplicateSourceSuggestion,
  getPotentialOriginalSource,
  normalizeBudgetImportSource,
} from '@/lib/budgetImportSafety';
import { parseBudgetImportMode, planBudgetLineImport } from '@/lib/budgetImportLines';
import { getCurrentHousehold } from '@/lib/households';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

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
  const requestedSource = formData.get('source');
  const importMode = parseBudgetImportMode(formData.get('importMode'));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Upload an .xlsx file.' }, { status: 400 });
  }

  if (!Number.isInteger(yearValue) || yearValue < 2000 || yearValue > 2100) {
    return NextResponse.json({ error: 'Choose a valid import year.' }, { status: 400 });
  }

  if (!importMode) {
    return NextResponse.json({ error: 'Choose Replace or Merge import mode.' }, { status: 400 });
  }

  try {
    const workbook = await parseGoogleSheetsBudgetWorkbook(await file.arrayBuffer(), yearValue);
    const source = normalizeBudgetImportSource(
      typeof requestedSource === 'string' ? requestedSource : null,
      file.name
    );
    const potentialOriginalSource = getPotentialOriginalSource(source);
    const [
      { data: existingLineRows, error: existingLinesError },
      potentialOriginalResult,
      categoryCountResult,
    ] = await Promise.all([
      supabase
        .from('imported_budget_lines')
        .select('id, source_sheet, source_cell, month')
        .eq('household_id', household.id)
        .eq('year', yearValue)
        .eq('source', source)
        .limit(10000),
      potentialOriginalSource
        ? supabase
            .from('imported_budget_lines')
            .select('id', { count: 'exact', head: true })
            .eq('household_id', household.id)
            .eq('year', yearValue)
            .eq('source', potentialOriginalSource)
        : Promise.resolve({ count: 0, error: null }),
      supabase
        .from('categories')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', household.id),
    ]);

    const previewQueryError = existingLinesError ?? potentialOriginalResult.error ?? categoryCountResult.error;
    if (previewQueryError) {
      return NextResponse.json({ error: previewQueryError.message }, { status: 500 });
    }

    const existingSources = new Set<string>();
    if ((existingLineRows ?? []).length > 0) {
      existingSources.add(source);
    }
    if ((potentialOriginalResult.count ?? 0) > 0 && potentialOriginalSource) {
      existingSources.add(potentialOriginalSource);
    }
    const suggestedSource = getDuplicateSourceSuggestion(source, existingSources);
    return NextResponse.json({
      fileName: file.name,
      source,
      importMode,
      suggestedSource,
      existingCategoryCount: categoryCountResult.count ?? 0,
      sheets: workbook.sheets.map((sheet) => {
        const lines = workbook.linesBySheet.get(sheet.name) ?? [];
        const linePlan = planBudgetLineImport(
          lines,
          existingLineRows ?? [],
          sheet.month ? [sheet.month] : [],
          importMode
        );

        return {
          ...sheet,
          updateLineCount: linePlan.updateCount,
          insertLineCount: linePlan.insertCount,
          deleteLineCount: linePlan.deleteIds.length,
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read workbook.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
