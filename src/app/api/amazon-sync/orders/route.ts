import { NextRequest, NextResponse } from 'next/server';
import {
  AMAZON_SYNC_MAX_ORDER_ITEMS,
  AmazonOrderDetailInput,
  getValidAmazonSyncSession,
  normalizeNullableText,
  normalizeOrderId,
  parseAmazonMoneyToCents,
} from '@/lib/amazonSync';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface AmazonOrderDetailPayload {
  token?: string;
  order?: AmazonOrderDetailInput;
  pageUrl?: string | null;
}

function parseQuantity(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.round(value));
  }

  if (typeof value !== 'string') {
    return null;
  }

  const match = value.match(/\d+/);
  return match ? Math.max(1, Number.parseInt(match[0], 10)) : null;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as AmazonOrderDetailPayload;
  const serviceSupabase = createServiceSupabaseClient();
  const { session, error: sessionError } = await getValidAmazonSyncSession(serviceSupabase, payload.token);

  if (sessionError || !session) {
    return NextResponse.json({ error: sessionError ?? 'Invalid sync token.' }, { status: 401 });
  }

  const orderId = normalizeOrderId(payload.order?.orderId);
  if (!orderId) {
    return NextResponse.json({ error: 'order.orderId is required.' }, { status: 400 });
  }

  const itemRows = (payload.order?.items ?? [])
    .slice(0, AMAZON_SYNC_MAX_ORDER_ITEMS)
    .map((item, index) => ({
      user_id: session.user_id,
      household_id: session.household_id,
      order_id: orderId,
      title: normalizeNullableText(item.title, 1000) ?? 'Unknown item',
      price_cents: parseAmazonMoneyToCents(item.price),
      asin: normalizeNullableText(item.asin, 32),
      quantity: parseQuantity(item.quantity),
      sort_order: index,
    }))
    .filter((item) => item.title !== 'Unknown item' || item.price_cents !== null || item.asin !== null);

  if (itemRows.length === 0) {
    return NextResponse.json(
      { error: 'Amazon did not expose any item details on this order page. The order was left incomplete so it can be retried.' },
      { status: 422 }
    );
  }

  const orderRow = {
    user_id: session.user_id,
    household_id: session.household_id,
    sync_session_id: session.id,
    order_id: orderId,
    order_detail_url: normalizeNullableText(payload.order?.orderDetailUrl ?? payload.pageUrl, 1000),
    item_subtotal_cents: parseAmazonMoneyToCents(payload.order?.itemSubtotal),
    shipping_cents: parseAmazonMoneyToCents(payload.order?.shipping),
    discounts_cents: parseAmazonMoneyToCents(payload.order?.discounts),
    tax_cents: parseAmazonMoneyToCents(payload.order?.tax),
    grand_total_cents: parseAmazonMoneyToCents(payload.order?.grandTotal),
    details_imported_at: null,
  };

  const { error: orderShellError } = await serviceSupabase.from('amazon_orders').upsert(orderRow, {
    onConflict: 'household_id,order_id',
  });

  if (orderShellError) {
    return NextResponse.json({ error: orderShellError.message }, { status: 500 });
  }

  const { error: deleteError } = await serviceSupabase
    .from('amazon_order_items')
    .delete()
    .eq('household_id', session.household_id)
    .eq('order_id', orderId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: itemError } = await serviceSupabase.from('amazon_order_items').insert(itemRows);
  if (itemError) {
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error: orderError } = await serviceSupabase
    .from('amazon_orders')
    .update({ details_imported_at: now })
    .eq('household_id', session.household_id)
    .eq('order_id', orderId);

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  return NextResponse.json({
    imported: true,
    order_id: orderId,
    item_count: itemRows.length,
    stop: false,
    cutoff_date: session.cutoff_date,
  });
}
