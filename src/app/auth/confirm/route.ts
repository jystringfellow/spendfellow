import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { findPendingHouseholdInvitation } from '@/lib/householdInvitations';
import { hasSupabaseEnv } from '@/lib/supabaseEnv';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

const ALLOWED_OTP_TYPES = new Set<EmailOtpType>(['invite', 'email', 'recovery', 'email_change']);

function getInvitationIdFromNext(requestUrl: URL): string | null {
  const next = requestUrl.searchParams.get('next');
  if (!next) {
    return null;
  }

  try {
    const nextUrl = new URL(next, requestUrl.origin);
    if (nextUrl.origin !== requestUrl.origin || nextUrl.pathname !== '/auth/set-password') {
      return null;
    }
    return nextUrl.searchParams.get('invitation');
  } catch {
    return null;
  }
}

function loginErrorRedirect(requestUrl: URL, message: string) {
  const loginUrl = new URL('/login', requestUrl.origin);
  loginUrl.searchParams.set('error', message);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;

  if (!hasSupabaseEnv() || !tokenHash || !type || !ALLOWED_OTP_TYPES.has(type)) {
    return loginErrorRedirect(requestUrl, 'The authentication link is incomplete or invalid.');
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user?.email) {
    return loginErrorRedirect(requestUrl, error?.message ?? 'The authentication link could not be verified.');
  }

  try {
    const invitation = await findPendingHouseholdInvitation(
      data.user.email,
      getInvitationIdFromNext(requestUrl)
    );
    if (invitation) {
      const passwordUrl = new URL('/auth/set-password', requestUrl.origin);
      passwordUrl.searchParams.set('invitation', invitation.id);
      return NextResponse.redirect(passwordUrl);
    }
  } catch (invitationError) {
    const message = invitationError instanceof Error ? invitationError.message : 'Unable to load the invitation.';
    return loginErrorRedirect(requestUrl, message);
  }

  return NextResponse.redirect(new URL('/settings', requestUrl.origin));
}
