-- Bring manually managed deployments forward from the canonical baseline and
-- make Data API permissions explicit. RLS remains the row-level authority.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS last_balance_sync_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_accounts_household_balance_sync
  ON public.accounts(household_id, last_balance_sync_at);

CREATE INDEX IF NOT EXISTS idx_categories_household_group_key
  ON public.categories(household_id, group_key);

CREATE INDEX IF NOT EXISTS idx_categories_household_is_group
  ON public.categories(household_id, is_group);

-- PostgreSQL views otherwise use their owner's privileges and can bypass the
-- underlying tables' RLS policies. These reporting views must use the caller's
-- permissions so household RLS is enforced throughout the view chain.
ALTER VIEW public.budget_actual_lines SET (security_invoker = true);
ALTER VIEW public.budget_vs_actual SET (security_invoker = true);
ALTER VIEW public.monthly_spending_by_category SET (security_invoker = true);

-- Remove legacy Supabase auto-grants, then grant only the access used by the
-- application. Anonymous users do not read or mutate public application data.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.account_balance_snapshots,
  public.accounts,
  public.budget_transaction_group_members,
  public.budget_transaction_groups,
  public.budgets,
  public.categories,
  public.category_balance_adjustments,
  public.category_budget_periods,
  public.category_layout_periods,
  public.credit_card_payment_links,
  public.household_invitations,
  public.household_members,
  public.imported_budget_lines,
  public.recurring_value_dependencies,
  public.recurring_value_periods,
  public.recurring_values,
  public.tags,
  public.transaction_split_tags,
  public.transaction_splits,
  public.transaction_tags,
  public.transactions
TO authenticated;

GRANT SELECT ON TABLE
  public.amazon_order_items,
  public.amazon_orders,
  public.amazon_payment_transactions,
  public.amazon_sync_sessions,
  public.budget_actual_lines,
  public.budget_vs_actual,
  public.households,
  public.monthly_spending_by_category,
  public.plaid_sync_runs,
  public.users
TO authenticated;

-- Never expose Plaid access tokens through the authenticated Data API role.
GRANT SELECT (
  id,
  user_id,
  plaid_item_id,
  institution_id,
  institution_name,
  status,
  error_code,
  last_sync_at,
  created_at,
  updated_at,
  household_id,
  plaid_environment
) ON TABLE public.plaid_items TO authenticated;

GRANT EXECUTE ON FUNCTION public.accept_household_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_household_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_household_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_workbook_constants() TO authenticated;

-- New migrations must opt application roles into access deliberately.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
