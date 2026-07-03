# Spendfellow Database Schema

## Overview
This schema is designed for PostgreSQL via Supabase with the following principles:
- Normalized structure to minimize redundancy
- Money stored as integers (cents) to avoid floating-point errors
- Support for 1-2 users (private, self-hosted)
- Plaid API integration for transaction syncing
- Flexible categorization and tagging system

## Tables

### users
Application users (1-2 for personal use).

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### accounts
Financial accounts linked via Plaid or manually created.

```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plaid_account_id TEXT UNIQUE,
  plaid_item_id TEXT,
  name TEXT NOT NULL,
  official_name TEXT,
  type TEXT NOT NULL, -- 'checking', 'savings', 'credit', 'investment', etc.
  subtype TEXT,
  current_balance_cents BIGINT,
  available_balance_cents BIGINT,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_accounts_plaid_account_id ON accounts(plaid_account_id);
```

### plaid_items
Stores Plaid connection metadata for each linked institution.

```sql
CREATE TABLE plaid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plaid_item_id TEXT UNIQUE NOT NULL,
  plaid_access_token TEXT NOT NULL,
  institution_id TEXT,
  institution_name TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'error', 'disconnected'
  error_code TEXT,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plaid_items_user_id ON plaid_items(user_id);
CREATE INDEX idx_plaid_items_plaid_item_id ON plaid_items(plaid_item_id);
```

### categories
Budget categories for organizing transactions.

```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT, -- hex color for UI display
  icon TEXT, -- icon identifier
  parent_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  is_income BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_categories_parent ON categories(parent_category_id);
```

### budgets
Monthly budgets per category.

```sql
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  amount_cents BIGINT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, category_id, year, month)
);

CREATE INDEX idx_budgets_user_id ON budgets(user_id);
CREATE INDEX idx_budgets_category_id ON budgets(category_id);
CREATE INDEX idx_budgets_year_month ON budgets(year, month);
```

### transactions
Financial transactions synced from Plaid or manually entered.

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  plaid_transaction_id TEXT UNIQUE,
  date DATE NOT NULL,
  amount_cents BIGINT NOT NULL, -- positive for expenses, negative for income
  merchant_name TEXT,
  description TEXT NOT NULL,
  pending BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_plaid_id ON transactions(plaid_transaction_id);
```

### tags
Flexible tagging system for transactions.

```sql
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE INDEX idx_tags_user_id ON tags(user_id);
```

### transaction_tags
Many-to-many relationship between transactions and tags.

```sql
CREATE TABLE transaction_tags (
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE INDEX idx_transaction_tags_transaction_id ON transaction_tags(transaction_id);
CREATE INDEX idx_transaction_tags_tag_id ON transaction_tags(tag_id);
```

## Row-Level Security (RLS)

Enable RLS on all tables to ensure users can only access their own data:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_tags ENABLE ROW LEVEL SECURITY;
```

### RLS Policies

```sql
-- Users can only see their own record
CREATE POLICY users_policy ON users
  FOR ALL USING (auth.uid() = id);

-- Users can only see their own accounts
CREATE POLICY accounts_policy ON accounts
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see their own Plaid items
CREATE POLICY plaid_items_policy ON plaid_items
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see their own categories
CREATE POLICY categories_policy ON categories
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see their own budgets
CREATE POLICY budgets_policy ON budgets
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see their own transactions
CREATE POLICY transactions_policy ON transactions
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see their own tags
CREATE POLICY tags_policy ON tags
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see tags for their own transactions
CREATE POLICY transaction_tags_policy ON transaction_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM transactions
      WHERE transactions.id = transaction_tags.transaction_id
      AND transactions.user_id = auth.uid()
    )
  );
```

## Key Design Decisions

1. **Money in Cents**: All monetary values stored as `BIGINT` in cents to avoid floating-point precision issues
2. **UUID Primary Keys**: Using UUIDs for better distribution and security
3. **Soft Deletes via is_active**: Accounts can be deactivated rather than deleted
4. **Flexible Categories**: Support for hierarchical categories with parent_category_id
5. **Transaction Amount Sign**: Positive for expenses, negative for income (standard accounting convention)
6. **Plaid Integration**: Separate plaid_items table to manage institution connections independently
7. **Timestamps**: All tables have created_at and updated_at for audit trails
8. **Indexes**: Strategic indexes on foreign keys and frequently queried fields

## Views for Common Queries

### Monthly Spending by Category

```sql
CREATE OR REPLACE VIEW monthly_spending_by_category AS
SELECT
  t.user_id,
  EXTRACT(YEAR FROM t.date) as year,
  EXTRACT(MONTH FROM t.date) as month,
  c.id as category_id,
  c.name as category_name,
  SUM(t.amount_cents) as total_cents,
  COUNT(*) as transaction_count
FROM transactions t
JOIN categories c ON t.category_id = c.id
WHERE NOT t.pending
GROUP BY t.user_id, year, month, c.id, c.name;
```

### Budget vs Actual

```sql
CREATE OR REPLACE VIEW budget_vs_actual AS
SELECT
  b.user_id,
  b.year,
  b.month,
  b.category_id,
  c.name as category_name,
  b.amount_cents as budgeted_cents,
  COALESCE(SUM(t.amount_cents), 0) as actual_cents,
  b.amount_cents - COALESCE(SUM(t.amount_cents), 0) as difference_cents
FROM budgets b
JOIN categories c ON b.category_id = c.id
LEFT JOIN transactions t ON
  t.category_id = b.category_id
  AND EXTRACT(YEAR FROM t.date) = b.year
  AND EXTRACT(MONTH FROM t.date) = b.month
  AND NOT t.pending
GROUP BY b.user_id, b.year, b.month, b.category_id, c.name, b.amount_cents;
```
