export function hasSupabaseEnv(): boolean {
  return Boolean(getSupabaseUrl() && getSupabasePublicKey());
}

export function getSupabasePublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function getSupabaseUrl(): string | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url || !/^https?:\/\//.test(url)) {
    return undefined;
  }

  return url;
}

export function getSupabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY;
}
