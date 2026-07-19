import { NextResponse } from 'next/server';
import { findPendingHouseholdInvitation } from '@/lib/householdInvitations';
import { hasSupabaseEnv } from '@/lib/supabaseEnv';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code && hasSupabaseEnv()) {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const loginUrl = new URL('/login', requestUrl.origin);
      loginUrl.searchParams.set('error', error.message);
      return NextResponse.redirect(loginUrl);
    }

    if (data.user?.email) {
      try {
        const invitation = await findPendingHouseholdInvitation(data.user.email);
        if (invitation) {
          const passwordUrl = new URL('/auth/set-password', requestUrl.origin);
          passwordUrl.searchParams.set('invitation', invitation.id);
          return NextResponse.redirect(passwordUrl);
        }
      } catch (invitationError) {
        const loginUrl = new URL('/login', requestUrl.origin);
        loginUrl.searchParams.set(
          'error',
          invitationError instanceof Error ? invitationError.message : 'Unable to load the household invitation.'
        );
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  return NextResponse.redirect(new URL('/settings', requestUrl.origin));
}
