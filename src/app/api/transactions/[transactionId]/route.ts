import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';
import { getCurrentHousehold } from '@/lib/households';

interface UpdateTransactionPayload {
  category_id?: string | null;
  notes?: string | null;
  tag_ids?: string[];
  tag_names?: string[];
  splits?: Array<{
    amount_cents: number;
    category_id: string | null;
    notes?: string | null;
    tag_ids?: string[];
    tag_names?: string[];
  }>;
}

interface RouteParams {
  params: {
    transactionId: string;
  };
}

function normalizeNotes(notes: string | null | undefined): string | null | undefined {
  if (notes === undefined) {
    return undefined;
  }

  if (notes === null) {
    return null;
  }

  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTagName(tagName: string): string | null {
  const trimmed = tagName.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface ResolvedTag {
  id: string;
  name: string;
  color: string | null;
}

interface TransactionRecord {
  id: string;
  household_id: string | null;
  amount_cents: number;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const payload = (await request.json()) as UpdateTransactionPayload;
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
  const { data: transaction, error: transactionError } = await serviceSupabase
    .from('transactions')
    .select('id, household_id, amount_cents')
    .eq('id', params.transactionId)
    .maybeSingle();

  if (transactionError) {
    return NextResponse.json({ error: transactionError.message }, { status: 500 });
  }

  const transactionRecord = transaction as TransactionRecord | null;

  if (!transactionRecord || transactionRecord.household_id !== household.id) {
    return NextResponse.json({ error: 'Transaction not found.' }, { status: 404 });
  }

  const normalizedCategoryId = payload.category_id || null;
  if (normalizedCategoryId) {
    const { data: category, error: categoryError } = await serviceSupabase
      .from('categories')
      .select('id')
      .eq('id', normalizedCategoryId)
      .eq('household_id', household.id)
      .maybeSingle();

    if (categoryError) {
      return NextResponse.json({ error: categoryError.message }, { status: 500 });
    }

    if (!category) {
      return NextResponse.json({ error: 'Category not found.' }, { status: 400 });
    }
  }

  const tagIds = payload.tag_ids ?? [];
  if (tagIds.length > 0) {
    const uniqueTagIds = Array.from(new Set(tagIds));
    const { data: tags, error: tagsError } = await serviceSupabase
      .from('tags')
      .select('id')
      .eq('household_id', household.id)
      .in('id', uniqueTagIds);

    if (tagsError) {
      return NextResponse.json({ error: tagsError.message }, { status: 500 });
    }

    if ((tags ?? []).length !== uniqueTagIds.length) {
      return NextResponse.json({ error: 'One or more tags were not found.' }, { status: 400 });
    }
  }

  const tagNames = Array.from(new Set((payload.tag_names ?? []).map(normalizeTagName).filter(Boolean))) as string[];
  const createdTagIds: string[] = [];
  const resolvedCreatedTags: ResolvedTag[] = [];
  const allSplitTagNames = (payload.splits ?? []).flatMap((split) => split.tag_names ?? []);
  const allTagNames = Array.from(new Set([...tagNames, ...allSplitTagNames].map(normalizeTagName).filter(Boolean))) as string[];
  const tagIdByNormalizedName = new Map<string, string>();
  for (const tagName of allTagNames) {
    const { data: existingTag, error: existingTagError } = await serviceSupabase
      .from('tags')
      .select('id, name, color')
      .eq('household_id', household.id)
      .ilike('name', tagName)
      .maybeSingle();

    if (existingTagError) {
      return NextResponse.json({ error: existingTagError.message }, { status: 500 });
    }

    if (existingTag) {
      createdTagIds.push(existingTag.id);
      resolvedCreatedTags.push(existingTag as ResolvedTag);
      tagIdByNormalizedName.set(tagName.toLowerCase(), existingTag.id);
      continue;
    }

    const { data: createdTag, error: createTagError } = await serviceSupabase
      .from('tags')
      .insert({
        user_id: user.id,
        household_id: household.id,
        name: tagName,
      })
      .select('id, name, color')
      .single();

    if (createTagError) {
      return NextResponse.json({ error: createTagError.message }, { status: 500 });
    }

    createdTagIds.push(createdTag.id);
    resolvedCreatedTags.push(createdTag as ResolvedTag);
    tagIdByNormalizedName.set(tagName.toLowerCase(), createdTag.id);
  }
  const directTagNameIds = tagNames
    .map((tagName) => tagIdByNormalizedName.get(tagName.toLowerCase()))
    .filter((tagId): tagId is string => Boolean(tagId));
  const uniqueTagIds = Array.from(new Set([...(payload.tag_ids ?? []), ...directTagNameIds]));
  let resolvedSplitTagIds: string[] = [];

  if (payload.splits) {
    const splitTotal = payload.splits.reduce((total, split) => total + split.amount_cents, 0);
    if (splitTotal !== transactionRecord.amount_cents) {
      return NextResponse.json({ error: 'Split amounts must equal the transaction amount.' }, { status: 400 });
    }

    const splitCategoryIds = Array.from(
      new Set(payload.splits.map((split) => split.category_id).filter((categoryId): categoryId is string => Boolean(categoryId)))
    );
    if (splitCategoryIds.length > 0) {
      const { data: splitCategories, error: splitCategoriesError } = await serviceSupabase
        .from('categories')
        .select('id')
        .eq('household_id', household.id)
        .in('id', splitCategoryIds);

      if (splitCategoriesError) {
        return NextResponse.json({ error: splitCategoriesError.message }, { status: 500 });
      }

      if ((splitCategories ?? []).length !== splitCategoryIds.length) {
        return NextResponse.json({ error: 'One or more split categories were not found.' }, { status: 400 });
      }
    }

    const splitTagIds = Array.from(
      new Set(
        payload.splits.flatMap((split) => [
          ...(split.tag_ids ?? []),
          ...(split.tag_names ?? [])
            .map(normalizeTagName)
            .filter(Boolean)
            .map((tagName) => tagIdByNormalizedName.get((tagName as string).toLowerCase()))
            .filter((tagId): tagId is string => Boolean(tagId)),
        ])
      )
    );
    resolvedSplitTagIds = splitTagIds;

    if (splitTagIds.length > 0) {
      const { data: splitTags, error: splitTagsError } = await serviceSupabase
        .from('tags')
        .select('id')
        .eq('household_id', household.id)
        .in('id', splitTagIds);

      if (splitTagsError) {
        return NextResponse.json({ error: splitTagsError.message }, { status: 500 });
      }

      if ((splitTags ?? []).length !== splitTagIds.length) {
        return NextResponse.json({ error: 'One or more split tags were not found.' }, { status: 400 });
      }
    }
  }

  const transactionUpdates: { category_id?: string | null; notes?: string | null } = {};
  if ('category_id' in payload) {
    transactionUpdates.category_id = normalizedCategoryId;
  }

  const normalizedNotes = normalizeNotes(payload.notes);
  if (normalizedNotes !== undefined) {
    transactionUpdates.notes = normalizedNotes;
  }

  if (Object.keys(transactionUpdates).length > 0) {
    const { error: updateError } = await serviceSupabase
      .from('transactions')
      .update(transactionUpdates)
      .eq('id', params.transactionId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  if (payload.tag_ids || payload.tag_names) {
    const { error: deleteTagsError } = await serviceSupabase
      .from('transaction_tags')
      .delete()
      .eq('transaction_id', params.transactionId);

    if (deleteTagsError) {
      return NextResponse.json({ error: deleteTagsError.message }, { status: 500 });
    }

    if (uniqueTagIds.length > 0) {
      const { error: insertTagsError } = await serviceSupabase.from('transaction_tags').insert(
        uniqueTagIds.map((tagId) => ({
          transaction_id: params.transactionId,
          tag_id: tagId,
        }))
      );

      if (insertTagsError) {
        return NextResponse.json({ error: insertTagsError.message }, { status: 500 });
      }
    }
  }

  if (payload.splits) {
    const { data: existingSplits, error: existingSplitsError } = await serviceSupabase
      .from('transaction_splits')
      .select('id')
      .eq('transaction_id', params.transactionId);

    if (existingSplitsError) {
      return NextResponse.json({ error: existingSplitsError.message }, { status: 500 });
    }

    const existingSplitIds = (existingSplits ?? []).map((split) => split.id);
    const { error: deleteSplitTagsError } =
      existingSplitIds.length > 0
        ? await serviceSupabase.from('transaction_split_tags').delete().in('transaction_split_id', existingSplitIds)
        : { error: null };

    if (deleteSplitTagsError) {
      return NextResponse.json({ error: deleteSplitTagsError.message }, { status: 500 });
    }

    const { error: deleteSplitsError } = await serviceSupabase
      .from('transaction_splits')
      .delete()
      .eq('transaction_id', params.transactionId);

    if (deleteSplitsError) {
      return NextResponse.json({ error: deleteSplitsError.message }, { status: 500 });
    }

    if (payload.splits.length > 0) {
      const { data: createdSplits, error: createSplitsError } = await serviceSupabase
        .from('transaction_splits')
        .insert(
          payload.splits.map((split, index) => ({
            transaction_id: params.transactionId,
            household_id: household.id,
            category_id: split.category_id,
            amount_cents: split.amount_cents,
            notes: normalizeNotes(split.notes),
            sort_order: index,
          }))
        )
        .select('id, sort_order');

      if (createSplitsError) {
        return NextResponse.json({ error: createSplitsError.message }, { status: 500 });
      }

      const sortedCreatedSplits = [...(createdSplits ?? [])].sort((firstSplit, secondSplit) => firstSplit.sort_order - secondSplit.sort_order);
      const splitTagRows = sortedCreatedSplits.flatMap((createdSplit) => {
        const split = payload.splits?.[createdSplit.sort_order];
        if (!split) {
          return [];
        }

        const splitTagIds = Array.from(
          new Set([
            ...(split.tag_ids ?? []),
            ...(split.tag_names ?? [])
              .map(normalizeTagName)
              .filter(Boolean)
              .map((tagName) => tagIdByNormalizedName.get((tagName as string).toLowerCase()))
              .filter((tagId): tagId is string => Boolean(tagId)),
          ])
        );

        return splitTagIds.map((tagId) => ({
          transaction_split_id: createdSplit.id,
          tag_id: tagId,
        }));
      });

      if (splitTagRows.length > 0) {
        const { error: createSplitTagsError } = await serviceSupabase.from('transaction_split_tags').insert(splitTagRows);

        if (createSplitTagsError) {
          return NextResponse.json({ error: createSplitTagsError.message }, { status: 500 });
        }
      }
    }
  }

  const { data: resolvedTags, error: resolvedTagsError } =
    uniqueTagIds.length + resolvedSplitTagIds.length > 0
      ? await serviceSupabase
          .from('tags')
          .select('id, name, color')
          .eq('household_id', household.id)
          .in('id', Array.from(new Set([...uniqueTagIds, ...resolvedSplitTagIds])))
      : { data: [], error: null };

  if (resolvedTagsError) {
    return NextResponse.json({ error: resolvedTagsError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    tags: resolvedTags?.length ? resolvedTags : resolvedCreatedTags,
  });
}
