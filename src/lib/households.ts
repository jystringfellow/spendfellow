import type { SupabaseClient } from '@supabase/supabase-js';
import type { Household, HouseholdMember } from '@/types/database';

interface HouseholdMembershipRow extends HouseholdMember {
  households: Household | Household[] | null;
}

export async function getCurrentHousehold(supabase: SupabaseClient): Promise<Household | null> {
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, user_id, role, created_at, households(*)')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const row = data as HouseholdMembershipRow;
  const household = Array.isArray(row.households) ? row.households[0] : row.households;

  return household ?? null;
}

