import { NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface RouteParams {
  params: {
    adjustmentId: string;
  };
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: 'You must be signed in to manage fun money.' },
      { status: 401 }
    );
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json(
      { error: 'Create a household before managing fun money.' },
      { status: 400 }
    );
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data: adjustment, error: adjustmentError } = await serviceSupabase
    .from('category_balance_adjustments')
    .select('id')
    .eq('id', params.adjustmentId)
    .eq('household_id', household.id)
    .maybeSingle();

  if (adjustmentError) {
    return NextResponse.json({ error: adjustmentError.message }, { status: 500 });
  }
  if (!adjustment) {
    return NextResponse.json({ error: 'Fun-money adjustment not found.' }, { status: 404 });
  }

  const { error } = await serviceSupabase
    .from('category_balance_adjustments')
    .delete()
    .eq('id', params.adjustmentId)
    .eq('household_id', household.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
