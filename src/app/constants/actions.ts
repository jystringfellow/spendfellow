'use server';

import { revalidatePath } from 'next/cache';
import { parseCurrencyToCents } from '@/lib/money';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { hasSupabaseEnv } from '@/lib/supabaseEnv';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const RGB_COLOR_PATTERN = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;

function getRequiredString(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required value: ${key}`);
  }

  return value.trim();
}

function getOptionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  return value.trim();
}

function getOptionalColor(formData: FormData, key: string): string | null {
  const color = getOptionalString(formData, key);

  if (!color) {
    return null;
  }

  if (!HEX_COLOR_PATTERN.test(color)) {
    const rgbMatch = color.match(RGB_COLOR_PATTERN);

    if (!rgbMatch) {
      throw new Error('Colors must use a hex value like #9900ff or RGB like rgb(153, 0, 255)');
    }

    const rgbValues = rgbMatch.slice(1).map((value) => Number(value));
    if (rgbValues.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
      throw new Error('RGB colors must use values between 0 and 255');
    }

    return `#${rgbValues.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  return color.toLowerCase();
}

function getOptionalPercent(formData: FormData, key: string): number | null {
  const value = getOptionalString(formData, key);

  if (!value) {
    return null;
  }

  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error('Target percent must be between 0 and 100');
  }

  return percent;
}

function getRequiredMonth(formData: FormData): number {
  const startMonth = Number(getRequiredString(formData, 'startMonth'));

  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new Error('Invalid start month');
  }

  return startMonth;
}

function getRequiredYear(formData: FormData): number {
  const year = Number(getRequiredString(formData, 'year'));

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('Invalid year');
  }

  return year;
}

async function getCurrentUserId(): Promise<string> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!user) {
    throw new Error('You must be signed in');
  }

  return user.id;
}

function revalidateSettingsPaths() {
  revalidatePath('/settings');
  revalidatePath('/transactions');
  revalidatePath('/budgets');
}

export async function seedWorkbookConstants() {
  if (!hasSupabaseEnv()) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc('seed_workbook_constants');

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettingsPaths();
}

export async function updateCategorySettings(formData: FormData) {
  const categoryId = getRequiredString(formData, 'categoryId');
  const householdId = getRequiredString(formData, 'householdId');
  const parentCategoryId = getRequiredString(formData, 'parentCategoryId');
  const name = getRequiredString(formData, 'name');
  const year = getRequiredYear(formData);
  const startMonth = getRequiredMonth(formData);
  const amountCents = parseCurrencyToCents(getRequiredString(formData, 'amount'));
  const supabase = createServerSupabaseClient();

  const { data: parentCategory, error: parentError } = await supabase
    .from('categories')
    .select('id, color, group_key, is_income')
    .eq('id', parentCategoryId)
    .eq('household_id', householdId)
    .eq('is_group', true)
    .single();

  if (parentError) {
    throw new Error(parentError.message);
  }

  if (!parentCategory) {
    throw new Error('Category group not found');
  }

  const { data: currentCategory, error: currentCategoryError } = await supabase
    .from('categories')
    .select('sort_order')
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .eq('is_group', false)
    .single();

  if (currentCategoryError) {
    throw new Error(currentCategoryError.message);
  }

  const { error: updateError } = await supabase
    .from('categories')
    .update({
      name,
      color: parentCategory.color,
      parent_category_id: parentCategoryId,
      group_key: parentCategory.group_key,
      is_income: Boolean(parentCategory.is_income),
      default_monthly_budget_cents: amountCents,
    })
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .eq('is_group', false);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: periodError } = await supabase.from('category_budget_periods').upsert(
    {
      household_id: householdId,
      category_id: categoryId,
      year,
      start_month: startMonth,
      amount_cents: amountCents,
    },
    { onConflict: 'household_id,category_id,year,start_month' }
  );

  if (periodError) {
    throw new Error(periodError.message);
  }

  const { error: layoutPeriodError } = await supabase.from('category_layout_periods').upsert(
    {
      household_id: householdId,
      category_id: categoryId,
      parent_category_id: parentCategoryId,
      start_year: year,
      start_month: startMonth,
      sort_order: Number(currentCategory?.sort_order ?? 0),
      is_visible: true,
    },
    { onConflict: 'household_id,category_id,start_year,start_month' }
  );

  if (layoutPeriodError) {
    throw new Error(layoutPeriodError.message);
  }

  revalidateSettingsPaths();
}

export async function updateCategoryGroupTarget(formData: FormData) {
  const categoryId = getRequiredString(formData, 'categoryId');
  const householdId = getRequiredString(formData, 'householdId');
  const targetPercent = getOptionalPercent(formData, 'targetPercent');
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from('categories')
    .update({ target_percent: targetPercent })
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .eq('is_group', true);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettingsPaths();
}

export async function deleteCategory(formData: FormData) {
  const categoryId = getRequiredString(formData, 'categoryId');
  const householdId = getRequiredString(formData, 'householdId');
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .eq('is_group', false);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettingsPaths();
}

export async function updateFixedRecurringValue(formData: FormData) {
  const recurringValueId = getRequiredString(formData, 'recurringValueId');
  const householdId = getRequiredString(formData, 'householdId');
  const year = getRequiredYear(formData);
  const startMonth = getRequiredMonth(formData);
  const billingFrequency = getRequiredString(formData, 'billingFrequency');
  const amountCents = parseCurrencyToCents(getRequiredString(formData, 'amount'));
  const name = getOptionalString(formData, 'name');
  const categoryId = getOptionalString(formData, 'categoryId');
  const supabase = createServerSupabaseClient();

  if (billingFrequency !== 'monthly' && billingFrequency !== 'yearly') {
    throw new Error('Invalid billing frequency');
  }

  const { data: recurringValue, error: recurringValueError } = await supabase
    .from('recurring_values')
    .select('kind')
    .eq('id', recurringValueId)
    .eq('kind', 'fixed')
    .single();

  if (recurringValueError) {
    throw new Error(recurringValueError.message);
  }

  if (!recurringValue) {
    throw new Error('Only fixed recurring values can be edited');
  }

  if (categoryId) {
    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('household_id', householdId)
      .eq('is_group', false)
      .single();

    if (categoryError) {
      throw new Error(categoryError.message);
    }

    if (!category) {
      throw new Error('Category not found');
    }
  }

  const recurringValueUpdates: Record<string, string> = {
    billing_frequency: billingFrequency,
  };

  if (name) {
    recurringValueUpdates.name = name;
  }

  if (categoryId) {
    recurringValueUpdates.category_id = categoryId;
  }

  const { error: frequencyError } = await supabase
    .from('recurring_values')
    .update(recurringValueUpdates)
    .eq('id', recurringValueId)
    .eq('household_id', householdId)
    .eq('kind', 'fixed');

  if (frequencyError) {
    throw new Error(frequencyError.message);
  }

  const { error } = await supabase.from('recurring_value_periods').upsert(
    {
      household_id: householdId,
      recurring_value_id: recurringValueId,
      year,
      start_month: startMonth,
      amount_cents: amountCents,
    },
    { onConflict: 'household_id,recurring_value_id,year,start_month' }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettingsPaths();
}

export async function deleteRecurringValue(formData: FormData) {
  const recurringValueId = getRequiredString(formData, 'recurringValueId');
  const householdId = getRequiredString(formData, 'householdId');
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from('recurring_values')
    .delete()
    .eq('id', recurringValueId)
    .eq('household_id', householdId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettingsPaths();
}

export async function updateRecurringFormula(formData: FormData) {
  const recurringValueId = getRequiredString(formData, 'recurringValueId');
  const householdId = getRequiredString(formData, 'householdId');
  const formulaOperator = getRequiredString(formData, 'formulaOperator');
  const name = getOptionalString(formData, 'name');
  const categoryId = getOptionalString(formData, 'categoryId');
  const dependencyIds = formData
    .getAll('dependencyIds')
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  const supabase = createServerSupabaseClient();

  if (formulaOperator !== 'sum' && formulaOperator !== 'negative_sum') {
    throw new Error('Invalid formula operator');
  }

  if (dependencyIds.includes(recurringValueId)) {
    throw new Error('A formula cannot depend on itself');
  }

  const { data: formulaValue, error: formulaValueError } = await supabase
    .from('recurring_values')
    .select('id')
    .eq('id', recurringValueId)
    .eq('household_id', householdId)
    .eq('kind', 'formula')
    .single();

  if (formulaValueError) {
    throw new Error(formulaValueError.message);
  }

  if (!formulaValue) {
    throw new Error('Only formula recurring values can be edited');
  }

  if (categoryId) {
    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('household_id', householdId)
      .eq('is_group', false)
      .single();

    if (categoryError) {
      throw new Error(categoryError.message);
    }

    if (!category) {
      throw new Error('Category not found');
    }
  }

  if (dependencyIds.length > 0) {
    const { data: dependencyRows, error: dependenciesError } = await supabase
      .from('recurring_values')
      .select('id')
      .eq('household_id', householdId)
      .eq('kind', 'fixed')
      .in('id', dependencyIds);

    if (dependenciesError) {
      throw new Error(dependenciesError.message);
    }

    if ((dependencyRows ?? []).length !== dependencyIds.length) {
      throw new Error('Formula dependencies must be fixed recurring values from this household');
    }
  }

  const formulaUpdates: Record<string, string> = {
    formula_operator: formulaOperator,
  };

  if (name) {
    formulaUpdates.name = name;
  }

  if (categoryId) {
    formulaUpdates.category_id = categoryId;
  }

  const { error: updateError } = await supabase
    .from('recurring_values')
    .update(formulaUpdates)
    .eq('id', recurringValueId)
    .eq('household_id', householdId)
    .eq('kind', 'formula');

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: deleteError } = await supabase
    .from('recurring_value_dependencies')
    .delete()
    .eq('recurring_value_id', recurringValueId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (dependencyIds.length > 0) {
    const { error: insertError } = await supabase.from('recurring_value_dependencies').insert(
      dependencyIds.map((dependencyId) => ({
        recurring_value_id: recurringValueId,
        depends_on_recurring_value_id: dependencyId,
      }))
    );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  revalidateSettingsPaths();
}

export async function updateTag(formData: FormData) {
  const tagId = getRequiredString(formData, 'tagId');
  const householdId = getRequiredString(formData, 'householdId');
  const name = getRequiredString(formData, 'name');
  const color = getOptionalColor(formData, 'color');
  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from('tags').update({ name, color }).eq('id', tagId).eq('household_id', householdId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettingsPaths();
}

export async function createTag(formData: FormData) {
  const householdId = getRequiredString(formData, 'householdId');
  const name = getRequiredString(formData, 'name');
  const color = getOptionalColor(formData, 'color');
  const userId = await getCurrentUserId();
  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from('tags').insert({
    user_id: userId,
    household_id: householdId,
    name,
    color,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettingsPaths();
}

export async function deleteTag(formData: FormData) {
  const tagId = getRequiredString(formData, 'tagId');
  const householdId = getRequiredString(formData, 'householdId');
  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from('tags').delete().eq('id', tagId).eq('household_id', householdId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettingsPaths();
}

export async function createCategory(formData: FormData) {
  const householdId = getRequiredString(formData, 'householdId');
  const parentCategoryId = getRequiredString(formData, 'parentCategoryId');
  const name = getRequiredString(formData, 'name');
  const year = getRequiredYear(formData);
  const startMonth = getRequiredMonth(formData);
  const amountCents = parseCurrencyToCents(getRequiredString(formData, 'amount'));
  const userId = await getCurrentUserId();
  const supabase = createServerSupabaseClient();

  const { data: parentCategory, error: parentError } = await supabase
    .from('categories')
    .select('id, color, group_key, is_income')
    .eq('id', parentCategoryId)
    .eq('household_id', householdId)
    .eq('is_group', true)
    .single();

  if (parentError) {
    throw new Error(parentError.message);
  }

  if (!parentCategory) {
    throw new Error('Category group not found');
  }

  const { data: sortRows, error: sortError } = await supabase
    .from('categories')
    .select('sort_order')
    .eq('household_id', householdId)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (sortError) {
    throw new Error(sortError.message);
  }

  const nextSortOrder = Number(sortRows?.[0]?.sort_order ?? 0) + 10;
  const { data: category, error } = await supabase
    .from('categories')
    .insert({
      user_id: userId,
      household_id: householdId,
      name,
      color: parentCategory.color,
      parent_category_id: parentCategoryId,
      group_key: parentCategory.group_key,
      default_monthly_budget_cents: amountCents,
      is_income: Boolean(parentCategory.is_income),
      sort_order: nextSortOrder,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const { error: periodError } = await supabase.from('category_budget_periods').insert({
    household_id: householdId,
    category_id: category.id,
    year,
    start_month: startMonth,
    amount_cents: amountCents,
  });

  if (periodError) {
    throw new Error(periodError.message);
  }

  const { error: layoutPeriodError } = await supabase.from('category_layout_periods').insert({
    household_id: householdId,
    category_id: category.id,
    parent_category_id: parentCategoryId,
    start_year: year,
    start_month: startMonth,
    sort_order: nextSortOrder,
    is_visible: true,
  });

  if (layoutPeriodError) {
    throw new Error(layoutPeriodError.message);
  }

  revalidateSettingsPaths();
}

export async function createRecurringValue(formData: FormData) {
  const householdId = getRequiredString(formData, 'householdId');
  const categoryId = getRequiredString(formData, 'categoryId');
  const name = getRequiredString(formData, 'name');
  const year = getRequiredYear(formData);
  const startMonth = getRequiredMonth(formData);
  const billingFrequency = getRequiredString(formData, 'billingFrequency');
  const amountCents = parseCurrencyToCents(getRequiredString(formData, 'amount'));
  const userId = await getCurrentUserId();
  const supabase = createServerSupabaseClient();

  if (billingFrequency !== 'monthly' && billingFrequency !== 'yearly') {
    throw new Error('Invalid billing frequency');
  }

  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .eq('is_group', false)
    .single();

  if (categoryError) {
    throw new Error(categoryError.message);
  }

  if (!category) {
    throw new Error('Category not found');
  }

  const { data: recurringValue, error } = await supabase
    .from('recurring_values')
    .insert({
      user_id: userId,
      household_id: householdId,
      category_id: categoryId,
      name,
      amount_cents: amountCents,
      kind: 'fixed',
      billing_frequency: billingFrequency,
      is_active: true,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const { error: periodError } = await supabase.from('recurring_value_periods').insert({
    household_id: householdId,
    recurring_value_id: recurringValue.id,
    year,
    start_month: startMonth,
    amount_cents: amountCents,
  });

  if (periodError) {
    throw new Error(periodError.message);
  }

  revalidateSettingsPaths();
}

export async function createRecurringFormula(formData: FormData) {
  const householdId = getRequiredString(formData, 'householdId');
  const categoryId = getRequiredString(formData, 'categoryId');
  const name = getRequiredString(formData, 'name');
  const formulaOperator = getRequiredString(formData, 'formulaOperator');
  const dependencyIds = formData
    .getAll('dependencyIds')
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  const userId = await getCurrentUserId();
  const supabase = createServerSupabaseClient();

  if (formulaOperator !== 'sum' && formulaOperator !== 'negative_sum') {
    throw new Error('Invalid formula operator');
  }

  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .eq('is_group', false)
    .single();

  if (categoryError) {
    throw new Error(categoryError.message);
  }

  if (!category) {
    throw new Error('Category not found');
  }

  if (dependencyIds.length > 0) {
    const { data: dependencyRows, error: dependenciesError } = await supabase
      .from('recurring_values')
      .select('id')
      .eq('household_id', householdId)
      .eq('kind', 'fixed')
      .in('id', dependencyIds);

    if (dependenciesError) {
      throw new Error(dependenciesError.message);
    }

    if ((dependencyRows ?? []).length !== dependencyIds.length) {
      throw new Error('Formula dependencies must be fixed recurring values from this household');
    }
  }

  const { data: recurringValue, error } = await supabase
    .from('recurring_values')
    .insert({
      user_id: userId,
      household_id: householdId,
      category_id: categoryId,
      name,
      amount_cents: 0,
      kind: 'formula',
      formula_operator: formulaOperator,
      billing_frequency: 'monthly',
      is_active: true,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (dependencyIds.length > 0) {
    const { error: insertError } = await supabase.from('recurring_value_dependencies').insert(
      dependencyIds.map((dependencyId) => ({
        recurring_value_id: recurringValue.id,
        depends_on_recurring_value_id: dependencyId,
      }))
    );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  revalidateSettingsPaths();
}
