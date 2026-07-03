import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getCurrentHousehold } from '@/lib/households';
import { createLinkToken, getConfiguredPlaidEnvironment, parsePlaidEnvironment, PlaidApiError } from '@/lib/plaid';

interface LinkTokenPayload {
  environment?: string;
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to connect accounts.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before connecting Plaid accounts.' }, { status: 400 });
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as LinkTokenPayload;
    const requestedEnvironment = payload.environment
      ? parsePlaidEnvironment(payload.environment)
      : getConfiguredPlaidEnvironment();

    if (!requestedEnvironment) {
      return NextResponse.json({ error: 'Plaid environment must be sandbox, development, or production.' }, { status: 400 });
    }

    const linkToken = await createLinkToken(user.id, requestedEnvironment);
    return NextResponse.json({ link_token: linkToken, environment: requestedEnvironment });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create Plaid link token.';
    const plaidError = error instanceof PlaidApiError ? error.plaidError : undefined;

    return NextResponse.json(
      {
        error: plaidError?.error_code ? `${plaidError.error_code}: ${message}` : message,
        plaid_error: plaidError,
      },
      { status: 500 }
    );
  }
}
