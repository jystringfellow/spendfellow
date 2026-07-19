import { NextRequest, NextResponse } from 'next/server';
import { parseGoogleSheetsBudgetWorkbook } from '@/lib/googleSheetsBudgetImport';
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

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Upload an .xlsx file.' }, { status: 400 });
  }

  if (!Number.isInteger(yearValue) || yearValue < 2000 || yearValue > 2100) {
    return NextResponse.json({ error: 'Choose a valid import year.' }, { status: 400 });
  }

  try {
    const workbook = await parseGoogleSheetsBudgetWorkbook(await file.arrayBuffer(), yearValue);
    return NextResponse.json({
      fileName: file.name,
      sheets: workbook.sheets,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read workbook.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
