import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from './supabaseService';
import type { HouseholdInvitation } from '@/types/database';

export interface PendingHouseholdInvitation extends HouseholdInvitation {
  household_name: string;
}

export function normalizeInvitationEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }

  return email;
}

export function getApplicationOrigin(fallbackOrigin: string): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (configuredUrl) {
    try {
      return new URL(configuredUrl).origin;
    } catch {
      // Fall back to the current request origin when the configured value is invalid.
    }
  }

  return new URL(fallbackOrigin).origin;
}

export async function findPendingHouseholdInvitation(
  email: string,
  preferredInvitationId?: string | null,
  serviceSupabase: SupabaseClient = createServiceSupabaseClient()
): Promise<PendingHouseholdInvitation | null> {
  let query = serviceSupabase
    .from('household_invitations')
    .select('*, households(name)')
    .eq('email', email.toLowerCase())
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (preferredInvitationId) {
    query = query.eq('id', preferredInvitationId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const householdRelation = data.households as { name?: string } | Array<{ name?: string }> | null;
  const household = Array.isArray(householdRelation) ? householdRelation[0] : householdRelation;

  return {
    ...(data as HouseholdInvitation),
    household_name: household?.name ?? 'Household',
  };
}
