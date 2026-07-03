import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@/lib/supabaseEnv';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code && hasSupabaseEnv()) {
    const supabase = createServerSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL('/settings', request.url));
}
