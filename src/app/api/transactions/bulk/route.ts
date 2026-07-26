import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface BulkTransactionUpdatePayload {
  transaction_ids?: string[];
  category?: {
    category_id?: string | null;
  };
  tags?: {
    mode?: 'add' | 'remove';
    tag_ids?: string[];
  };
  budget_group?: {
    group_id?: string | null;
    group_name?: string | null;
  };
}

interface ResolvedBudgetGroup {
  id: string;
  name: string;
}

function normalizeBudgetGroupName(name: string | null | undefined): string | null {
  const normalizedName = name?.trim().replace(/\s+/g, ' ') ?? '';
  return normalizedName.length > 0 ? normalizedName : null;
}

export async function PATCH(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as BulkTransactionUpdatePayload;
  const transactionIds = Array.from(new Set(payload.transaction_ids ?? []));

  if (transactionIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one transaction.' }, { status: 400 });
  }
  if (transactionIds.length > 500) {
    return NextResponse.json({ error: 'Bulk edits are limited to 500 transactions at a time.' }, { status: 400 });
  }
  if (!payload.category && !payload.tags && !payload.budget_group) {
    return NextResponse.json({ error: 'Choose at least one change to apply.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to edit transactions.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before editing transactions.' }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data: transactionRows, error: transactionsError } = await serviceSupabase
    .from('transactions')
    .select('id')
    .eq('household_id', household.id)
    .in('id', transactionIds);

  if (transactionsError) {
    return NextResponse.json({ error: transactionsError.message }, { status: 500 });
  }
  if ((transactionRows ?? []).length !== transactionIds.length) {
    return NextResponse.json({ error: 'One or more selected transactions were not found.' }, { status: 404 });
  }

  let normalizedCategoryId: string | null | undefined;
  if (payload.category) {
    normalizedCategoryId = payload.category.category_id || null;

    const [{ data: splitRows, error: splitsError }, { data: category, error: categoryError }] = await Promise.all([
      serviceSupabase
        .from('transaction_splits')
        .select('transaction_id')
        .in('transaction_id', transactionIds)
        .limit(1),
      normalizedCategoryId
        ? serviceSupabase
            .from('categories')
            .select('id')
            .eq('id', normalizedCategoryId)
            .eq('household_id', household.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (splitsError || categoryError) {
      return NextResponse.json({ error: splitsError?.message ?? categoryError?.message }, { status: 500 });
    }
    if ((splitRows ?? []).length > 0) {
      return NextResponse.json(
        { error: 'Category cannot be changed in bulk while split transactions are selected.' },
        { status: 400 }
      );
    }
    if (normalizedCategoryId && !category) {
      return NextResponse.json({ error: 'Category not found.' }, { status: 400 });
    }
  }

  const tagIds = Array.from(new Set(payload.tags?.tag_ids ?? []));
  if (payload.tags) {
    if (payload.tags.mode !== 'add' && payload.tags.mode !== 'remove') {
      return NextResponse.json({ error: 'Choose whether to add or remove tags.' }, { status: 400 });
    }
    if (tagIds.length === 0) {
      return NextResponse.json({ error: 'Choose at least one tag.' }, { status: 400 });
    }

    const { data: tagRows, error: tagsError } = await serviceSupabase
      .from('tags')
      .select('id')
      .eq('household_id', household.id)
      .in('id', tagIds);

    if (tagsError) {
      return NextResponse.json({ error: tagsError.message }, { status: 500 });
    }
    if ((tagRows ?? []).length !== tagIds.length) {
      return NextResponse.json({ error: 'One or more tags were not found.' }, { status: 400 });
    }
  }

  let resolvedBudgetGroup: ResolvedBudgetGroup | null | undefined;
  if (payload.budget_group) {
    const requestedGroupId = payload.budget_group.group_id || null;
    const requestedGroupName = normalizeBudgetGroupName(payload.budget_group.group_name);

    if (requestedGroupId && requestedGroupName) {
      return NextResponse.json({ error: 'Choose an existing budget group or create a new one, not both.' }, { status: 400 });
    }
    if (requestedGroupName && requestedGroupName.length > 80) {
      return NextResponse.json({ error: 'Budget group names must be 80 characters or fewer.' }, { status: 400 });
    }

    if (requestedGroupId) {
      const { data: group, error: groupError } = await serviceSupabase
        .from('budget_transaction_groups')
        .select('id, name')
        .eq('id', requestedGroupId)
        .eq('household_id', household.id)
        .maybeSingle();

      if (groupError) {
        return NextResponse.json({ error: groupError.message }, { status: 500 });
      }
      if (!group) {
        return NextResponse.json({ error: 'Budget group not found.' }, { status: 400 });
      }
      resolvedBudgetGroup = group as ResolvedBudgetGroup;
    } else if (requestedGroupName) {
      const { data: existingGroups, error: existingGroupsError } = await serviceSupabase
        .from('budget_transaction_groups')
        .select('id, name')
        .eq('household_id', household.id);

      if (existingGroupsError) {
        return NextResponse.json({ error: existingGroupsError.message }, { status: 500 });
      }

      resolvedBudgetGroup =
        ((existingGroups ?? []) as ResolvedBudgetGroup[]).find(
          (group) => group.name.trim().toLowerCase() === requestedGroupName.toLowerCase()
        ) ?? null;

      if (!resolvedBudgetGroup) {
        const { data: createdGroup, error: createGroupError } = await serviceSupabase
          .from('budget_transaction_groups')
          .insert({
            household_id: household.id,
            name: requestedGroupName,
            created_by: user.id,
          })
          .select('id, name')
          .single();

        if (createGroupError) {
          return NextResponse.json({ error: createGroupError.message }, { status: 500 });
        }
        resolvedBudgetGroup = createdGroup as ResolvedBudgetGroup;
      }
    } else {
      resolvedBudgetGroup = null;
    }
  }

  if (payload.category) {
    const { error: categoryUpdateError } = await serviceSupabase
      .from('transactions')
      .update({ category_id: normalizedCategoryId ?? null })
      .eq('household_id', household.id)
      .in('id', transactionIds);

    if (categoryUpdateError) {
      return NextResponse.json({ error: categoryUpdateError.message }, { status: 500 });
    }
  }

  if (payload.tags?.mode === 'add') {
    const { error: addTagsError } = await serviceSupabase
      .from('transaction_tags')
      .upsert(
        transactionIds.flatMap((transactionId) =>
          tagIds.map((tagId) => ({ transaction_id: transactionId, tag_id: tagId }))
        ),
        { onConflict: 'transaction_id,tag_id', ignoreDuplicates: true }
      );

    if (addTagsError) {
      return NextResponse.json({ error: addTagsError.message }, { status: 500 });
    }
  } else if (payload.tags?.mode === 'remove') {
    const { error: removeTagsError } = await serviceSupabase
      .from('transaction_tags')
      .delete()
      .in('transaction_id', transactionIds)
      .in('tag_id', tagIds);

    if (removeTagsError) {
      return NextResponse.json({ error: removeTagsError.message }, { status: 500 });
    }
  }

  if (payload.budget_group) {
    if (resolvedBudgetGroup) {
      const { error: assignGroupError } = await serviceSupabase
        .from('budget_transaction_group_members')
        .upsert(
          transactionIds.map((transactionId) => ({
            transaction_id: transactionId,
            group_id: resolvedBudgetGroup!.id,
            household_id: household.id,
            created_by: user.id,
          })),
          { onConflict: 'transaction_id' }
        );

      if (assignGroupError) {
        return NextResponse.json({ error: assignGroupError.message }, { status: 500 });
      }
    } else {
      const { error: removeGroupError } = await serviceSupabase
        .from('budget_transaction_group_members')
        .delete()
        .eq('household_id', household.id)
        .in('transaction_id', transactionIds);

      if (removeGroupError) {
        return NextResponse.json({ error: removeGroupError.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    budget_group: resolvedBudgetGroup,
    updated_count: transactionIds.length,
  });
}
