// Database types matching the schema

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Household {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface HouseholdMember {
  household_id: string;
  user_id: string;
  role: 'owner' | 'member';
  created_at: string;
}

export interface HouseholdInvitation {
  id: string;
  household_id: string;
  email: string;
  invited_by: string;
  role: 'member';
  status: 'pending' | 'accepted' | 'revoked';
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  household_id: string | null;
  plaid_account_id: string | null;
  plaid_item_id: string | null;
  plaid_environment: 'sandbox' | 'development' | 'production' | null;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  current_balance_cents: number | null;
  available_balance_cents: number | null;
  balance_category: 'checking' | 'savings' | 'ccDebt' | 'investments' | 'hidden' | null;
  source: 'plaid' | 'manual';
  currency_code: string;
  is_active: boolean;
  last_balance_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountBalanceSnapshot {
  id: string;
  user_id: string;
  household_id: string | null;
  account_id: string;
  current_balance_cents: number | null;
  available_balance_cents: number | null;
  currency_code: string;
  recorded_at: string;
  created_at: string;
}

export interface PlaidItem {
  id: string;
  user_id: string;
  household_id: string | null;
  plaid_item_id: string;
  plaid_access_token: string;
  plaid_environment: 'sandbox' | 'development' | 'production' | null;
  institution_id: string | null;
  institution_name: string | null;
  status: 'active' | 'error' | 'disconnected';
  error_code: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlaidSyncRun {
  id: string;
  household_id: string;
  user_id: string;
  plaid_item_id: string | null;
  account_id: string | null;
  plaid_environment: 'sandbox' | 'development' | 'production' | null;
  sync_type: 'transactions' | 'balances';
  status: 'success' | 'error' | 'skipped';
  started_at: string;
  finished_at: string | null;
  start_date: string | null;
  end_date: string | null;
  requested_count: number;
  imported_count: number;
  skipped_count: number;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AmazonSyncSession {
  id: string;
  household_id: string;
  user_id: string;
  token_hash: string;
  app_origin: string;
  cutoff_date: string | null;
  expires_at: string;
  last_seen_at: string | null;
  created_at: string;
}

export interface AmazonOrder {
  id: string;
  household_id: string;
  user_id: string;
  sync_session_id: string | null;
  order_id: string;
  order_detail_url: string | null;
  item_subtotal_cents: number | null;
  shipping_cents: number | null;
  discounts_cents: number | null;
  tax_cents: number | null;
  grand_total_cents: number | null;
  raw_summary_text: string | null;
  details_imported_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AmazonPaymentTransaction {
  id: string;
  household_id: string;
  user_id: string;
  sync_session_id: string | null;
  order_id: string;
  transaction_date: string | null;
  amount_cents: number;
  payment_method_hint: string | null;
  merchant_text: string | null;
  order_detail_url: string | null;
  raw_text: string | null;
  is_refund: boolean;
  plaid_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AmazonOrderItem {
  id: string;
  household_id: string;
  user_id: string;
  order_id: string;
  title: string;
  price_cents: number | null;
  asin: string | null;
  quantity: number | null;
  sort_order: number;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  parent_category_id: string | null;
  group_key: string | null;
  target_percent: number | null;
  is_group: boolean;
  default_monthly_budget_cents: number;
  rollover_enabled: boolean;
  rollover_start_date: string | null;
  is_income: boolean;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export type CategoryBalanceAdjustmentKind =
  | 'income_allocation'
  | 'gift'
  | 'opening_balance'
  | 'correction'
  | 'other';

export interface CategoryBalanceAdjustment {
  id: string;
  household_id: string;
  category_id: string;
  source_transaction_id: string | null;
  effective_date: string;
  amount_cents: number;
  kind: CategoryBalanceAdjustmentKind;
  status: 'pending' | 'posted' | 'void';
  description: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryLayoutPeriod {
  id: string;
  household_id: string;
  category_id: string;
  parent_category_id: string | null;
  start_year: number;
  start_month: number;
  end_year: number | null;
  end_month: number | null;
  sort_order: number;
  is_visible: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  household_id: string | null;
  category_id: string;
  year: number;
  month: number;
  amount_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  household_id: string | null;
  account_id: string;
  category_id: string | null;
  plaid_transaction_id: string | null;
  plaid_environment: 'sandbox' | 'development' | 'production' | null;
  source: 'plaid' | 'manual';
  date: string;
  amount_cents: number;
  merchant_name: string | null;
  description: string;
  pending: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditCardPaymentLink {
  id: string;
  household_id: string;
  checking_transaction_id: string;
  credit_transaction_id: string;
  created_by: string;
  created_at: string;
}

export interface BudgetTransactionGroup {
  id: string;
  household_id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetTransactionGroupMember {
  transaction_id: string;
  group_id: string;
  household_id: string;
  created_by: string;
  created_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  color: string | null;
  created_at: string;
}

export interface TransactionTag {
  transaction_id: string;
  tag_id: string;
  created_at: string;
}

export interface TransactionSplit {
  id: string;
  transaction_id: string;
  household_id: string;
  category_id: string | null;
  amount_cents: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TransactionSplitTag {
  transaction_split_id: string;
  tag_id: string;
  created_at: string;
}

export interface BudgetActualLine {
  transaction_id: string | null;
  transaction_split_id: string | null;
  imported_budget_line_id: string | null;
  user_id: string;
  household_id: string | null;
  account_id: string | null;
  category_id: string | null;
  date: string;
  amount_cents: number;
  pending: boolean;
  notes: string | null;
  plaid_environment: 'sandbox' | 'development' | 'production' | null;
  is_split: boolean;
  source_type: 'transaction' | 'transaction_split' | 'imported_budget_line';
  description: string;
  merchant_name: string | null;
}

export interface ImportedBudgetLine {
  id: string;
  household_id: string;
  user_id: string;
  category_id: string | null;
  source: string;
  source_sheet: string;
  source_cell: string;
  year: number;
  month: number;
  date: string;
  amount_cents: number;
  description: string;
  notes: string | null;
  raw_comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringValue {
  id: string;
  user_id: string;
  household_id: string | null;
  category_id: string | null;
  name: string;
  amount_cents: number;
  kind: 'fixed' | 'formula';
  formula_operator: 'sum' | 'negative_sum' | null;
  billing_frequency: 'monthly' | 'yearly';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecurringValueDependency {
  recurring_value_id: string;
  depends_on_recurring_value_id: string;
  created_at: string;
}

export interface CategoryBudgetPeriod {
  id: string;
  household_id: string;
  category_id: string;
  year: number;
  start_month: number;
  amount_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringValuePeriod {
  id: string;
  household_id: string;
  recurring_value_id: string;
  year: number;
  start_month: number;
  amount_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Extended types for UI usage
export interface TransactionWithDetails extends Transaction {
  account?: Account;
  category?: Category;
  tags?: Tag[];
}

export interface BudgetWithCategory extends Budget {
  category: Category;
  actual_cents?: number;
  difference_cents?: number;
}

export interface MonthlySpending {
  user_id: string;
  household_id: string | null;
  year: number;
  month: number;
  category_id: string;
  category_name: string;
  total_cents: number;
  transaction_count: number;
}

export interface BudgetVsActual {
  user_id: string;
  household_id: string | null;
  year: number;
  month: number;
  category_id: string;
  category_name: string;
  budgeted_cents: number;
  actual_cents: number;
  difference_cents: number;
}

// Utility types
export type NewTransaction = Omit<Transaction, 'id' | 'created_at' | 'updated_at'>;
export type NewBudget = Omit<Budget, 'id' | 'created_at' | 'updated_at'>;
export type NewCategory = Omit<Category, 'id' | 'created_at' | 'updated_at'>;
export type NewCategoryBalanceAdjustment = Omit<
  CategoryBalanceAdjustment,
  'id' | 'created_at' | 'updated_at'
>;
export type NewAccount = Omit<Account, 'id' | 'created_at' | 'updated_at'>;
export type NewRecurringValue = Omit<RecurringValue, 'id' | 'created_at' | 'updated_at'>;
export type NewRecurringValueDependency = Omit<RecurringValueDependency, 'created_at'>;
export type NewCategoryBudgetPeriod = Omit<CategoryBudgetPeriod, 'id' | 'created_at' | 'updated_at'>;
export type NewRecurringValuePeriod = Omit<RecurringValuePeriod, 'id' | 'created_at' | 'updated_at'>;
export type NewHousehold = Omit<Household, 'id' | 'created_at' | 'updated_at'>;
export type NewHouseholdMember = Omit<HouseholdMember, 'created_at'>;
