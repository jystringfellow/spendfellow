import 'server-only';

import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const AMAZON_SYNC_TOKEN_BYTES = 32;
export const AMAZON_SYNC_TOKEN_TTL_MINUTES = 30;
export const AMAZON_SYNC_MAX_TRANSACTIONS_PER_BATCH = 50;
export const AMAZON_SYNC_MAX_ORDER_ITEMS = 100;

export interface AmazonSyncSession {
  id: string;
  user_id: string;
  household_id: string;
  token_hash: string;
  app_origin: string;
  cutoff_date: string | null;
  expires_at: string;
  last_seen_at: string | null;
  created_at: string;
}

export interface AmazonPaymentTransactionInput {
  orderId: string;
  amount: string | number;
  transactionDate?: string | null;
  paymentMethodHint?: string | null;
  merchantText?: string | null;
  orderDetailUrl?: string | null;
  rawText?: string | null;
  isRefund?: boolean | null;
}

export interface AmazonOrderDetailInput {
  orderId: string;
  orderDetailUrl?: string | null;
  itemSubtotal?: string | number | null;
  shipping?: string | number | null;
  discounts?: string | number | null;
  tax?: string | number | null;
  grandTotal?: string | number | null;
  items?: AmazonOrderItemInput[];
}

export interface AmazonOrderItemInput {
  title?: string | null;
  price?: string | number | null;
  asin?: string | null;
  quantity?: string | number | null;
}

export function createAmazonSyncToken() {
  const token = randomBytes(AMAZON_SYNC_TOKEN_BYTES).toString('base64url');
  return {
    token,
    tokenHash: hashAmazonSyncToken(token),
  };
}

export function hashAmazonSyncToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function isAllowedAmazonSyncOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

export function normalizeNullableText(value: unknown, maxLength = 1000) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function normalizeOrderId(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.match(/\b\d{3}-\d{7}-\d{7}\b/);
  return match?.[0] ?? null;
}

export function parseAmazonMoneyToCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isNegative = /^-/.test(trimmed) || /\(\s*\$?[\d,.]+\s*\)/.test(trimmed);
  const numeric = trimmed.replace(/[^\d.]/g, '');
  if (!numeric) {
    return null;
  }

  const amount = Number.parseFloat(numeric);
  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount * 100) * (isNegative ? -1 : 1);
}

export function normalizeAmazonDate(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

export async function getValidAmazonSyncSession(
  supabase: SupabaseClient,
  token: unknown
): Promise<{ session: AmazonSyncSession | null; error: string | null }> {
  if (typeof token !== 'string' || token.length < 24) {
    return { session: null, error: 'Missing or invalid sync token.' };
  }

  const tokenHash = hashAmazonSyncToken(token);
  const { data, error } = await supabase
    .from('amazon_sync_sessions')
    .select('*')
    .eq('token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    return { session: null, error: error.message };
  }

  if (!data) {
    return { session: null, error: 'Sync token is expired or invalid.' };
  }

  const session = data as AmazonSyncSession;
  await supabase.from('amazon_sync_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', session.id);

  return { session, error: null };
}
