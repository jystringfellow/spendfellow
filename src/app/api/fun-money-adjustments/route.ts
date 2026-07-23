import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { isIsoDate, normalizeLedgerText } from '@/lib/transactionLedger';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';
import type {
  CategoryBalanceAdjustment,
  CategoryBalanceAdjustmentKind,
} from '@/types/database';

interface AdjustmentAllocationPayload {
  category_id?: string;
  amount_cents?: number;
}

interface SaveAdjustmentsPayload {
  source_transaction_id?: string | null;
  effective_date?: string;
  kind?: CategoryBalanceAdjustmentKind;
  description?: string;
  notes?: string | null;
  allocations?: AdjustmentAllocationPayload[];
}

const MANUAL_KINDS = new Set<CategoryBalanceAdjustmentKind>([
  'gift',
  'opening_balance',
  'correction',
  'other',
]);

async function getAuthenticatedHousehold() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  const household = user && !userError ? await getCurrentHousehold(supabase) : null;

  return { user, household };
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as SaveAdjustmentsPayload;
  const allocations = (payload.allocations ?? []).filter(
    (allocation) =>
      Boolean(allocation.category_id) &&
      Number.isSafeInteger(allocation.amount_cents) &&
      allocation.amount_cents !== 0
  );
  const categoryIds = Array.from(
    new Set(allocations.map((allocation) => allocation.category_id as string))
  );
  const description = normalizeLedgerText(payload.description, 240);
  const notes = normalizeLedgerText(payload.notes, 1000);

  if (!description) {
    return NextResponse.json({ error: 'Description is required.' }, { status: 400 });
  }

  if (allocations.length !== categoryIds.length) {
    return NextResponse.json(
      { error: 'Each rollover category can only be allocated once.' },
      { status: 400 }
    );
  }

  const { user, household } = await getAuthenticatedHousehold();
  if (!user) {
    return NextResponse.json(
      { error: 'You must be signed in to manage fun money.' },
      { status: 401 }
    );
  }
  if (!household) {
    return NextResponse.json(
      { error: 'Create a household before managing fun money.' },
      { status: 400 }
    );
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data: categoryRows, error: categoriesError } =
    categoryIds.length > 0
      ? await serviceSupabase
          .from('categories')
          .select('id, rollover_start_date')
          .eq('household_id', household.id)
          .eq('rollover_enabled', true)
          .in('id', categoryIds)
      : { data: [], error: null };

  if (categoriesError) {
    return NextResponse.json({ error: categoriesError.message }, { status: 500 });
  }
  if ((categoryRows ?? []).length !== categoryIds.length) {
    return NextResponse.json(
      { error: 'One or more rollover categories were not found.' },
      { status: 400 }
    );
  }

  let effectiveDate = payload.effective_date;
  let kind: CategoryBalanceAdjustmentKind;

  if (payload.source_transaction_id) {
    const { data: sourceTransaction, error: sourceError } = await serviceSupabase
      .from('transactions')
      .select('id, date, amount_cents, pending')
      .eq('id', payload.source_transaction_id)
      .eq('household_id', household.id)
      .maybeSingle();

    if (sourceError) {
      return NextResponse.json({ error: sourceError.message }, { status: 500 });
    }
    if (!sourceTransaction) {
      return NextResponse.json({ error: 'Income transaction not found.' }, { status: 404 });
    }
    if (sourceTransaction.pending || sourceTransaction.amount_cents >= 0) {
      return NextResponse.json(
        { error: 'Only posted income transactions can fund fun money.' },
        { status: 400 }
      );
    }
    if (allocations.some((allocation) => (allocation.amount_cents ?? 0) <= 0)) {
      return NextResponse.json(
        { error: 'Income allocations must be positive.' },
        { status: 400 }
      );
    }

    const allocatedCents = allocations.reduce(
      (total, allocation) => total + (allocation.amount_cents ?? 0),
      0
    );
    if (allocatedCents > Math.abs(sourceTransaction.amount_cents)) {
      return NextResponse.json(
        { error: 'Fun-money allocations cannot exceed the income transaction.' },
        { status: 400 }
      );
    }

    effectiveDate = payload.effective_date ?? sourceTransaction.date;
    kind = 'income_allocation';
  } else {
    kind = payload.kind && MANUAL_KINDS.has(payload.kind) ? payload.kind : 'other';
    if (allocations.length === 0) {
      return NextResponse.json({ error: 'Enter a fun-money amount.' }, { status: 400 });
    }
    if (kind !== 'correction' && allocations.some((allocation) => (allocation.amount_cents ?? 0) <= 0)) {
      return NextResponse.json(
        { error: 'Credits must be positive; use a correction for a negative adjustment.' },
        { status: 400 }
      );
    }
  }

  if (!isIsoDate(effectiveDate)) {
    return NextResponse.json({ error: 'Choose a valid effective date.' }, { status: 400 });
  }
  if (
    (categoryRows ?? []).some(
      (category) =>
        category.rollover_start_date && category.rollover_start_date > effectiveDate
    )
  ) {
    return NextResponse.json(
      { error: 'The adjustment date cannot be before the category rollover start.' },
      { status: 400 }
    );
  }

  const adjustmentRows = allocations.map((allocation) => ({
    household_id: household.id,
    category_id: allocation.category_id as string,
    source_transaction_id: payload.source_transaction_id || null,
    effective_date: effectiveDate,
    amount_cents: allocation.amount_cents as number,
    kind,
    status: 'posted',
    description,
    notes,
    created_by: user.id,
  }));

  if (payload.source_transaction_id) {
    const { data: existingRows, error: existingError } = await serviceSupabase
      .from('category_balance_adjustments')
      .select('*')
      .eq('household_id', household.id)
      .eq('source_transaction_id', payload.source_transaction_id);

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const existingAdjustments = (existingRows ?? []) as CategoryBalanceAdjustment[];
    const { error: deleteError } = await serviceSupabase
      .from('category_balance_adjustments')
      .delete()
      .eq('household_id', household.id)
      .eq('source_transaction_id', payload.source_transaction_id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (adjustmentRows.length === 0) {
      return NextResponse.json({ adjustments: [] });
    }

    const { data: savedRows, error: insertError } = await serviceSupabase
      .from('category_balance_adjustments')
      .insert(adjustmentRows)
      .select('*');

    if (insertError) {
      if (existingAdjustments.length > 0) {
        await serviceSupabase.from('category_balance_adjustments').insert(
          existingAdjustments.map(({ id, created_at, updated_at, ...adjustment }) => ({
            id,
            created_at,
            updated_at,
            ...adjustment,
          }))
        );
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ adjustments: savedRows ?? [] });
  }

  const { data: savedRows, error: insertError } = await serviceSupabase
    .from('category_balance_adjustments')
    .insert(adjustmentRows)
    .select('*');

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ adjustments: savedRows ?? [] }, { status: 201 });
}
