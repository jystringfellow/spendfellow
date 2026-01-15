// Database types matching the schema

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  plaid_account_id: string | null;
  plaid_item_id: string | null;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  current_balance_cents: number | null;
  available_balance_cents: number | null;
  currency_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlaidItem {
  id: string;
  user_id: string;
  plaid_item_id: string;
  plaid_access_token: string;
  institution_id: string | null;
  institution_name: string | null;
  status: 'active' | 'error' | 'disconnected';
  error_code: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  parent_category_id: string | null;
  is_income: boolean;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
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
  account_id: string;
  category_id: string | null;
  plaid_transaction_id: string | null;
  date: string;
  amount_cents: number;
  merchant_name: string | null;
  description: string;
  pending: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface TransactionTag {
  transaction_id: string;
  tag_id: string;
  created_at: string;
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
  year: number;
  month: number;
  category_id: string;
  category_name: string;
  total_cents: number;
  transaction_count: number;
}

export interface BudgetVsActual {
  user_id: string;
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
export type NewAccount = Omit<Account, 'id' | 'created_at' | 'updated_at'>;
