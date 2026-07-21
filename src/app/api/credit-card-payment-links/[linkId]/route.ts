import { NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface RouteParams {
  params: {
    linkId: string;
  };
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to unlink payments.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before unlinking payments.' }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data: link, error: linkError } = await serviceSupabase
    .from('credit_card_payment_links')
    .select('id')
    .eq('id', params.linkId)
    .eq('household_id', household.id)
    .maybeSingle();

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }
  if (!link) {
    return NextResponse.json({ error: 'Payment link not found.' }, { status: 404 });
  }

  const { error } = await serviceSupabase
    .from('credit_card_payment_links')
    .delete()
    .eq('id', params.linkId)
    .eq('household_id', household.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
