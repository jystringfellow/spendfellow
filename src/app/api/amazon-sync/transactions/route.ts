import { NextRequest, NextResponse } from 'next/server';
import {
  AMAZON_SYNC_MAX_TRANSACTIONS_PER_BATCH,
  AmazonPaymentTransactionInput,
  getValidAmazonSyncSession,
  normalizeAmazonDate,
  normalizeNullableText,
  normalizeOrderId,
  parseAmazonMoneyToCents,
} from '@/lib/amazonSync';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface AmazonTransactionBatchPayload {
  token?: string;
  transactions?: AmazonPaymentTransactionInput[];
  pageUrl?: string | null;
  forceReindex?: boolean | null;
}

interface NormalizedAmazonTransactionRow {
  user_id: string;
  household_id: string;
  sync_session_id: string;
  order_id: string;
  transaction_date: string | null;
  amount_cents: number;
  payment_method_hint: string | null;
  merchant_text: string | null;
  order_detail_url: string | null;
  raw_text: string | null;
  is_refund: boolean;
}

function getTransactionIdentity(
  row: Pick<NormalizedAmazonTransactionRow, 'order_id' | 'amount_cents' | 'payment_method_hint' | 'transaction_date'>
) {
  return JSON.stringify([row.order_id, row.amount_cents, row.payment_method_hint ?? null, row.transaction_date ?? null]);
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as AmazonTransactionBatchPayload;
  const serviceSupabase = createServiceSupabaseClient();
  const { session, error: sessionError } = await getValidAmazonSyncSession(serviceSupabase, payload.token);

  if (sessionError || !session) {
    return NextResponse.json({ error: sessionError ?? 'Invalid sync token.' }, { status: 401 });
  }

  const transactions = Array.isArray(payload.transactions)
    ? payload.transactions.slice(0, AMAZON_SYNC_MAX_TRANSACTIONS_PER_BATCH)
    : [];

  const parsedRows = transactions
    .map((transaction) => {
      const orderId = normalizeOrderId(transaction.orderId);
      const amountCents = parseAmazonMoneyToCents(transaction.amount);

      if (!orderId || amountCents === null) {
        return null;
      }

      return {
        user_id: session.user_id,
        household_id: session.household_id,
        sync_session_id: session.id,
        order_id: orderId,
        transaction_date: normalizeAmazonDate(transaction.transactionDate),
        amount_cents: amountCents,
        payment_method_hint: normalizeNullableText(transaction.paymentMethodHint, 160),
        merchant_text: normalizeNullableText(transaction.merchantText, 300),
        order_detail_url: normalizeNullableText(transaction.orderDetailUrl, 1000),
        raw_text: normalizeNullableText(transaction.rawText, 2000),
        is_refund: Boolean(transaction.isRefund),
      };
    })
    .filter((row): row is NormalizedAmazonTransactionRow => row !== null);
  const rowByIdentity = new Map<string, NormalizedAmazonTransactionRow>();
  parsedRows.forEach((row) => {
    rowByIdentity.set(getTransactionIdentity(row), row);
  });
  const rows = Array.from(rowByIdentity.values());

  const seenOrderIds = Array.from(new Set(rows.map((row) => row.order_id)));
  const { data: existingTransactionRows, error: existingTransactionError } =
    seenOrderIds.length > 0
      ? await serviceSupabase
          .from('amazon_payment_transactions')
          .select('order_id, amount_cents, payment_method_hint, transaction_date')
          .eq('household_id', session.household_id)
          .in('order_id', seenOrderIds)
      : { data: [], error: null };

  if (existingTransactionError) {
    return NextResponse.json({ error: existingTransactionError.message }, { status: 500 });
  }

  const existingTransactionIdentities = new Set(
    (
      (existingTransactionRows ?? []) as Array<{
        order_id: string;
        amount_cents: number;
        payment_method_hint: string | null;
        transaction_date: string | null;
      }>
    ).map(getTransactionIdentity)
  );
  const transaction_statuses = rows.map((row) => ({
    orderId: row.order_id,
    existing: existingTransactionIdentities.has(getTransactionIdentity(row)),
  }));

  if (rows.length > 0) {
    const { error } = await serviceSupabase.from('amazon_payment_transactions').upsert(rows, {
      onConflict: 'household_id,order_id,amount_cents,payment_method_hint,transaction_date',
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { data: existingOrderRows, error: existingOrderError } =
    seenOrderIds.length > 0
      ? await serviceSupabase
          .from('amazon_orders')
          .select('order_id, details_imported_at')
          .eq('household_id', session.household_id)
          .in('order_id', seenOrderIds)
      : { data: [], error: null };

  if (existingOrderError) {
    return NextResponse.json({ error: existingOrderError.message }, { status: 500 });
  }

  const importedOrderIds = new Set(
    ((existingOrderRows ?? []) as Array<{ order_id: string; details_imported_at: string | null }>)
      .filter((row) => row.details_imported_at)
      .map((row) => row.order_id)
  );
  const needed_orders = seenOrderIds
    .filter((orderId) => payload.forceReindex || !importedOrderIds.has(orderId))
    .map((orderId) => {
      const source = rows.find((row) => row.order_id === orderId);
      return {
        orderId,
        orderDetailUrl: source?.order_detail_url ?? null,
      };
    });

  return NextResponse.json({
    imported_count: rows.length,
    parsed_count: parsedRows.length,
    duplicate_count: parsedRows.length - rows.length,
    existing_transaction_count: transaction_statuses.filter((transaction) => transaction.existing).length,
    transaction_statuses,
    needed_orders,
    stop: rows.length === 0,
    cutoff_date: session.cutoff_date,
  });
}
