-- Amazon purchase sync prototype.
-- Browser scraping is performed by the user-installed Tampermonkey script. The
-- app stores only short-lived token hashes and imported purchase metadata.

CREATE TABLE IF NOT EXISTS amazon_sync_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  app_origin TEXT NOT NULL,
  cutoff_date DATE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS amazon_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sync_session_id UUID REFERENCES amazon_sync_sessions(id) ON DELETE SET NULL,
  order_id TEXT NOT NULL,
  order_detail_url TEXT,
  item_subtotal_cents BIGINT,
  shipping_cents BIGINT,
  discounts_cents BIGINT,
  tax_cents BIGINT,
  grand_total_cents BIGINT,
  raw_summary_text TEXT,
  details_imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, order_id)
);

CREATE TABLE IF NOT EXISTS amazon_payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sync_session_id UUID REFERENCES amazon_sync_sessions(id) ON DELETE SET NULL,
  order_id TEXT NOT NULL,
  transaction_date DATE,
  amount_cents BIGINT NOT NULL,
  payment_method_hint TEXT,
  merchant_text TEXT,
  order_detail_url TEXT,
  raw_text TEXT,
  is_refund BOOLEAN NOT NULL DEFAULT false,
  plaid_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT amazon_payment_transactions_unique
    UNIQUE NULLS NOT DISTINCT (household_id, order_id, amount_cents, payment_method_hint, transaction_date)
);

CREATE TABLE IF NOT EXISTS amazon_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  title TEXT NOT NULL,
  price_cents BIGINT,
  asin TEXT,
  quantity INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE amazon_sync_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS amazon_sync_sessions_policy ON amazon_sync_sessions;
CREATE POLICY amazon_sync_sessions_policy ON amazon_sync_sessions
  FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS amazon_orders_policy ON amazon_orders;
CREATE POLICY amazon_orders_policy ON amazon_orders
  FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS amazon_payment_transactions_policy ON amazon_payment_transactions;
CREATE POLICY amazon_payment_transactions_policy ON amazon_payment_transactions
  FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS amazon_order_items_policy ON amazon_order_items;
CREATE POLICY amazon_order_items_policy ON amazon_order_items
  FOR SELECT USING (is_household_member(household_id));

GRANT SELECT ON amazon_sync_sessions TO authenticated;
GRANT SELECT ON amazon_orders TO authenticated;
GRANT SELECT ON amazon_payment_transactions TO authenticated;
GRANT SELECT ON amazon_order_items TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON amazon_sync_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON amazon_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON amazon_payment_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON amazon_order_items TO service_role;

CREATE INDEX IF NOT EXISTS idx_amazon_sync_sessions_household_created
  ON amazon_sync_sessions(household_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_amazon_sync_sessions_expires
  ON amazon_sync_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_amazon_orders_household_order
  ON amazon_orders(household_id, order_id);

CREATE INDEX IF NOT EXISTS idx_amazon_orders_household_imported
  ON amazon_orders(household_id, details_imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_amazon_payment_transactions_household_created
  ON amazon_payment_transactions(household_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_amazon_payment_transactions_household_order
  ON amazon_payment_transactions(household_id, order_id);

CREATE INDEX IF NOT EXISTS idx_amazon_order_items_household_order
  ON amazon_order_items(household_id, order_id, sort_order);

DROP TRIGGER IF EXISTS update_amazon_orders_updated_at ON amazon_orders;
CREATE TRIGGER update_amazon_orders_updated_at
  BEFORE UPDATE ON amazon_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_amazon_payment_transactions_updated_at ON amazon_payment_transactions;
CREATE TRIGGER update_amazon_payment_transactions_updated_at
  BEFORE UPDATE ON amazon_payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
