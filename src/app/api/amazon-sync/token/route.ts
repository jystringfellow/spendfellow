import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import {
  AMAZON_SYNC_TOKEN_TTL_MINUTES,
  addMinutes,
  createAmazonSyncToken,
  isAllowedAmazonSyncOrigin,
} from '@/lib/amazonSync';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface CreateAmazonSyncTokenPayload {
  cutoffDate?: string | null;
  appOrigin?: string | null;
  forceReindex?: boolean | null;
}

function getRequestOrigin(request: NextRequest, payloadOrigin: string | null | undefined) {
  if (payloadOrigin) {
    return payloadOrigin;
  }

  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

function normalizeCutoffDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to start Amazon sync.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before syncing Amazon purchases.' }, { status: 400 });
  }

  const payload = (await request.json().catch(() => ({}))) as CreateAmazonSyncTokenPayload;
  const appOrigin = getRequestOrigin(request, payload.appOrigin);
  if (!isAllowedAmazonSyncOrigin(appOrigin)) {
    return NextResponse.json({ error: 'Amazon sync requires an HTTPS app origin.' }, { status: 400 });
  }

  const cutoffDate = normalizeCutoffDate(payload.cutoffDate);
  if (payload.cutoffDate && !cutoffDate) {
    return NextResponse.json({ error: 'cutoffDate must be a date in YYYY-MM-DD format.' }, { status: 400 });
  }

  const { token, tokenHash } = createAmazonSyncToken();
  const expiresAt = addMinutes(new Date(), AMAZON_SYNC_TOKEN_TTL_MINUTES).toISOString();
  const serviceSupabase = createServiceSupabaseClient();
  const { error } = await serviceSupabase.from('amazon_sync_sessions').insert({
    user_id: user.id,
    household_id: household.id,
    token_hash: tokenHash,
    app_origin: appOrigin,
    cutoff_date: cutoffDate,
    expires_at: expiresAt,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const amazonUrl = new URL('https://www.amazon.com/cpe/yourpayments/transactions');
  amazonUrl.searchParams.set('budgetSync', '1');
  amazonUrl.searchParams.set('budgetAppOrigin', appOrigin);
  amazonUrl.searchParams.set('budgetSyncToken', token);
  if (cutoffDate) {
    amazonUrl.searchParams.set('budgetCutoffDate', cutoffDate);
  }
  if (payload.forceReindex) {
    amazonUrl.searchParams.set('budgetForceReindex', '1');
  }

  return NextResponse.json({
    token,
    expires_at: expiresAt,
    cutoff_date: cutoffDate,
    amazon_url: amazonUrl.toString(),
  });
}
