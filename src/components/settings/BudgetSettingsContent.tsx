import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '@/lib/money';
import { resolveCategoryLayout } from '@/lib/categoryLayouts';
import {
  clampMonth,
  monthOptions,
  resolveCategoryBudgetAmount,
} from '@/lib/constantPeriods';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { hasSupabaseEnv } from '@/lib/supabaseEnv';
import { getCurrentHousehold } from '@/lib/households';
import { formatFormulaDescription, resolveRecurringValues } from '@/lib/recurringValues';
import {
  ACCOUNT_BALANCE_CATEGORY_OPTIONS,
  getAccountBalanceCategory,
  getAccountBalanceCategoryLabel,
  type AccountBalanceCategory,
} from '@/lib/accountBalanceCategories';
import type { ResolvedRecurringValue } from '@/lib/recurringValues';
import type {
  Category,
  CategoryBudgetPeriod,
  RecurringValue,
  RecurringValueDependency,
  RecurringValuePeriod,
  Tag,
  Account,
  CategoryLayoutPeriod,
} from '@/types/database';
import {
  CategoryDialogButton,
  FormulaDialogButton,
  GroupTargetDialogButton,
  RecurringValueDialogButton,
  TagDialogButton,
} from '@/components/settings/SettingsDialogs';
import {
  createCategory,
  createRecurringFormula,
  createRecurringValue,
  createTag,
  deleteCategory,
  deleteRecurringValue,
  deleteTag,
  seedWorkbookConstants,
  updateCategoryGroupTarget,
  updateCategorySettings,
  updateFixedRecurringValue,
  updateRecurringFormula,
  updateTag,
} from '@/app/constants/actions';
import type { ReactNode } from 'react';

interface RecurringValueRow extends ResolvedRecurringValue {
  categoryName: string;
  groupName: string;
}

interface ConstantsPageProps {
  searchParams?: {
    year?: string;
    month?: string;
  };
  embedded?: boolean;
  trailingContent?: ReactNode;
}

function getMonthLabel(month: number | null): string {
  if (!month) {
    return 'Base';
  }

  return monthOptions.find((option) => option.value === month)?.label ?? 'Base';
}

function getGroupTotalCents(
  group: Category,
  categories: Category[],
  periods: CategoryBudgetPeriod[],
  year: number,
  month: number
): number {
  return categories
    .filter((category) => category.parent_category_id === group.id)
    .reduce((total, category) => {
      const amount = resolveCategoryBudgetAmount(
        category.id,
        category.default_monthly_budget_cents,
        periods,
        year,
        month
      );
      return total + amount.amount_cents;
    }, 0);
}

function getTotalBudgetCents(
  groups: Category[],
  categories: Category[],
  periods: CategoryBudgetPeriod[],
  year: number,
  month: number
): number {
  return groups.reduce((total, group) => total + getGroupTotalCents(group, categories, periods, year, month), 0);
}

function isIncomeGroup(group: Category): boolean {
  return group.group_key === 'income' || group.name.toLowerCase().includes('income');
}

function isBudgetGroup(group: Category): boolean {
  return !isIncomeGroup(group);
}

function buildRecurringRows(
  recurringValues: RecurringValue[],
  dependencies: RecurringValueDependency[],
  periods: RecurringValuePeriod[],
  year: number,
  month: number,
  categories: Category[]
): RecurringValueRow[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const resolvedRecurringValues = resolveRecurringValues(recurringValues, dependencies, periods, year, month);

  return resolvedRecurringValues.map((value) => {
    const category = value.category_id ? categoryById.get(value.category_id) : undefined;
    const group = category?.parent_category_id ? categoryById.get(category.parent_category_id) : undefined;

    return {
      ...value,
      categoryName: category?.name ?? '',
      groupName: group?.name ?? '',
    };
  });
}

function getBalanceCategoryTotalCents(accounts: Account[], category: AccountBalanceCategory): number {
  return accounts
    .filter((account) => getAccountBalanceCategory(account) === category)
    .reduce((total, account) => {
      const amount = Math.abs(account.current_balance_cents ?? 0);
      return total + (category === 'ccDebt' ? -amount : amount);
    }, 0);
}

export async function BudgetSettingsContent({ searchParams, embedded = false, trailingContent }: ConstantsPageProps) {
  const now = new Date();
  const selectedYear = Number(searchParams?.year) || now.getFullYear();
  const selectedMonth = clampMonth(Number(searchParams?.month) || now.getMonth() + 1);

  if (!hasSupabaseEnv()) {
    const content = (
      <Box sx={{ my: embedded ? 0 : 4 }}>
        <Alert severity="warning">
          Supabase is not configured. Add the Supabase environment variables before loading database-backed
          constants.
        </Alert>
      </Box>
    );

    return embedded ? content : (
      <Container maxWidth="lg">
        {content}
      </Container>
    );
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getCurrentHousehold(supabase);

  const [
    { data: categoryData, error: categoriesError },
    { data: categoryLayoutData, error: categoryLayoutsError },
    { data: recurringData, error: recurringError },
    { data: dependencyData, error: dependenciesError },
    { data: categoryPeriodData, error: categoryPeriodsError },
    { data: recurringPeriodData, error: recurringPeriodsError },
    { data: tagData, error: tagsError },
    { data: accountData, error: accountsError },
  ] = household
    ? await Promise.all([
        supabase
          .from('categories')
          .select('*')
          .eq('household_id', household.id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('category_layout_periods')
          .select('*')
          .eq('household_id', household.id),
        supabase
          .from('recurring_values')
          .select('*')
          .eq('household_id', household.id)
          .eq('is_active', true)
          .order('name', { ascending: true }),
        supabase.from('recurring_value_dependencies').select('*'),
        supabase
          .from('category_budget_periods')
          .select('*')
          .eq('household_id', household.id)
          .eq('year', selectedYear),
        supabase
          .from('recurring_value_periods')
          .select('*')
          .eq('household_id', household.id)
          .eq('year', selectedYear),
        supabase.from('tags').select('*').eq('household_id', household.id).order('name', { ascending: true }),
        supabase.from('accounts').select('*').eq('household_id', household.id).eq('is_active', true),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (categoriesError) {
    throw new Error(categoriesError.message);
  }

  if (categoryLayoutsError) {
    throw new Error(categoryLayoutsError.message);
  }

  if (recurringError) {
    throw new Error(recurringError.message);
  }

  if (dependenciesError) {
    throw new Error(dependenciesError.message);
  }

  if (categoryPeriodsError) {
    throw new Error(categoryPeriodsError.message);
  }

  if (recurringPeriodsError) {
    throw new Error(recurringPeriodsError.message);
  }

  if (tagsError) {
    throw new Error(tagsError.message);
  }

  if (accountsError) {
    throw new Error(accountsError.message);
  }

  const categories = (categoryData ?? []) as Category[];
  const categoryLayouts = (categoryLayoutData ?? []) as CategoryLayoutPeriod[];
  const effectiveCategoryLayouts = resolveCategoryLayout(categories, categoryLayouts, selectedYear, selectedMonth).filter(
    (layout) => layout.isVisible
  );
  const effectiveCategories = effectiveCategoryLayouts
    .map((layout) => ({
      ...layout.category,
      parent_category_id: layout.parentCategoryId,
      sort_order: layout.sortOrder,
    }))
    .sort((first, second) => (first.sort_order ?? 0) - (second.sort_order ?? 0));
  const recurringValues = (recurringData ?? []) as RecurringValue[];
  const dependencies = (dependencyData ?? []) as RecurringValueDependency[];
  const categoryPeriods = (categoryPeriodData ?? []) as CategoryBudgetPeriod[];
  const recurringPeriods = (recurringPeriodData ?? []) as RecurringValuePeriod[];
  const tags = (tagData ?? []) as Tag[];
  const accounts = (accountData ?? []) as Account[];
  const groups = effectiveCategories.filter((category) => category.is_group);
  const budgetGroups = groups.filter(isBudgetGroup);
  const transferGroups = groups.filter((group) => !isBudgetGroup(group));
  const childCategories = effectiveCategories.filter((category) => !category.is_group);
  const totalBudgetCents = getTotalBudgetCents(budgetGroups, effectiveCategories, categoryPeriods, selectedYear, selectedMonth);
  const hiddenBalanceAccounts = accounts.filter((account) => getAccountBalanceCategory(account) === 'hidden');
  const visibleBalanceCategories = ACCOUNT_BALANCE_CATEGORY_OPTIONS.map((option) => ({
    ...option,
    totalCents: getBalanceCategoryTotalCents(accounts, option.value),
  }));
  const recurringRows = buildRecurringRows(
    recurringValues,
    dependencies,
    recurringPeriods,
    selectedYear,
    selectedMonth,
    effectiveCategories
  );
  const recurringInputRows = recurringRows.filter((value) => value.kind === 'fixed');
  const recurringFormulaRows = recurringRows.filter((value) => value.kind === 'formula');

  const content = (
    <Box sx={{ my: embedded ? 0 : 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Budget Settings
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 780 }}>
          Manage category budgets, recurring planning values, account balance buckets, formulas, and tags.
        </Typography>
        {household && <Chip label={household.name} sx={{ mt: 2 }} />}

        <Paper
          component="form"
          sx={{ p: 2, mt: 3, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}
        >
          <Typography variant="subtitle2">Planning context</Typography>
          <TextField
            name="year"
            label="Year"
            type="number"
            size="small"
            defaultValue={selectedYear}
            sx={{ width: 120 }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            select
            name="month"
            label="Month"
            size="small"
            defaultValue={selectedMonth}
            sx={{ width: 120 }}
            InputLabelProps={{ shrink: true }}
          >
            {monthOptions.map((month) => (
              <MenuItem key={month.value} value={month.value}>
                {month.label}
              </MenuItem>
            ))}
          </TextField>
          <Button type="submit" variant="outlined">
            View
          </Button>
        </Paper>

        {groups.length === 0 && (
          <Paper sx={{ p: 3, mt: 3 }}>
              <Typography variant="h6" component="h2" gutterBottom>
                Seed Workbook Constants
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Add the category groups, default budgets, and recurring values from your current workbook.
            </Typography>
            <Box component="form" action={seedWorkbookConstants}>
              <Button type="submit" variant="contained">
                Seed constants
              </Button>
            </Box>
          </Paper>
        )}

        {groups.length > 0 && (
          <Box sx={{ display: 'grid', gap: 3, mt: 3 }}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" component="h2" gutterBottom>
                Budget Groups
              </Typography>
              <TableContainer>
                <Table size="small" aria-label="budget group targets">
                  <TableHead>
                    <TableRow>
                      <TableCell>Group</TableCell>
                      <TableCell align="right">Target % of Income</TableCell>
                      <TableCell align="right">Current Monthly Budget</TableCell>
                      <TableCell align="right">Annual Budget</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {budgetGroups.map((group) => {
                      const groupTotalCents = getGroupTotalCents(
                        group,
                        effectiveCategories,
                        categoryPeriods,
                        selectedYear,
                        selectedMonth
                      );

                      return (
                        <TableRow key={group.id}>
                          <TableCell
                            sx={{
                              borderLeft: `8px solid ${group.color ?? '#9e9e9e'}`,
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {group.name}
                          </TableCell>
                          <TableCell align="right">
                            {group.target_percent === null ? '' : `${group.target_percent}%`}
                          </TableCell>
                          <TableCell align="right">{formatCurrency(groupTotalCents)}</TableCell>
                          <TableCell align="right">{formatCurrency(groupTotalCents * 12)}</TableCell>
                          <TableCell align="right">
                            <GroupTargetDialogButton
                              action={updateCategoryGroupTarget}
                              householdId={household?.id ?? ''}
                              group={group}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {budgetGroups.reduce((total, group) => total + Number(group.target_percent ?? 0), 0)}%
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {formatCurrency(totalBudgetCents)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {formatCurrency(totalBudgetCents * 12)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 1,
                  mb: 2,
                }}
              >
                <Box>
                  <Typography variant="h6" component="h2">
                    Budget Balance Categories
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    These are the account balance buckets shown on Accounts and the budget sheet.
                  </Typography>
                </Box>
                <Button component={Link} href="/accounts" variant="outlined">
                  Assign accounts
                </Button>
              </Box>
              <TableContainer>
                <Table size="small" aria-label="budget balance categories">
                  <TableHead>
                    <TableRow>
                      <TableCell>Category</TableCell>
                      <TableCell>Included in balance cards</TableCell>
                      <TableCell align="right">Current balance</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleBalanceCategories.map((category) => (
                      <TableRow key={category.value}>
                        <TableCell sx={{ fontWeight: 700 }}>{category.label}</TableCell>
                        <TableCell>Yes</TableCell>
                        <TableCell align="right">{formatCurrency(category.totalCents)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>{getAccountBalanceCategoryLabel('hidden')}</TableCell>
                      <TableCell>No</TableCell>
                      <TableCell align="right">{hiddenBalanceAccounts.length ? 'Hidden' : '-'}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 1,
                  mb: 2,
                }}
              >
                <Typography variant="h6" component="h2">
                  Category Budgets
                </Typography>
                <CategoryDialogButton
                  mode="add"
                  action={createCategory}
                  householdId={household?.id ?? ''}
                  year={selectedYear}
                  startMonth={selectedMonth}
                  groups={groups}
                />
              </Box>

              <TableContainer>
                <Table size="small" aria-label="category budget constants">
                  <TableHead>
                    <TableRow>
                      <TableCell>Group</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell align="right">Monthly Budget</TableCell>
                      <TableCell align="right">Effective From</TableCell>
                      <TableCell align="right">Rollover</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...budgetGroups, ...transferGroups].map((group) => {
                      const groupCategories = childCategories.filter(
                        (category) => category.parent_category_id === group.id
                      );
                      const groupTotalCents = getGroupTotalCents(
                        group,
                        effectiveCategories,
                        categoryPeriods,
                        selectedYear,
                        selectedMonth
                      );

                      return [
                        <TableRow key={`${group.id}:total`}>
                          <TableCell
                            sx={{
                              borderLeft: `8px solid ${group.color ?? '#9e9e9e'}`,
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {group.name}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Group total</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {formatCurrency(groupTotalCents)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {group.target_percent === null ? '' : `Target ${group.target_percent}%`}
                          </TableCell>
                          <TableCell />
                          <TableCell />
                        </TableRow>,
                        ...groupCategories.map((category) => {
                          const resolvedAmount = resolveCategoryBudgetAmount(
                            category.id,
                            category.default_monthly_budget_cents,
                            categoryPeriods,
                            selectedYear,
                            selectedMonth
                          );

                          return (
                            <TableRow key={category.id}>
                              <TableCell />
                              <TableCell>{category.name}</TableCell>
                              <TableCell align="right">
                                {formatCurrency(resolvedAmount.amount_cents)}
                              </TableCell>
                              <TableCell align="right">{getMonthLabel(resolvedAmount.effective_start_month)}</TableCell>
                              <TableCell align="right">
                                {category.rollover_enabled ? (
                                  <Chip size="small" color="success" label="Carries forward" />
                                ) : (
                                  'Monthly'
                                )}
                              </TableCell>
                              <TableCell align="right">
                                <CategoryDialogButton
                                  mode="edit"
                                  action={updateCategorySettings}
                                  deleteAction={deleteCategory}
                                  householdId={household?.id ?? ''}
                                  year={selectedYear}
                                  startMonth={selectedMonth}
                                  groups={groups}
                                  category={{
                                    id: category.id,
                                    name: category.name,
                                    parent_category_id: category.parent_category_id,
                                    amount_cents: resolvedAmount.amount_cents,
                                    rollover_enabled: category.rollover_enabled,
                                    rollover_start_date: category.rollover_start_date,
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        }),
                      ];
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                <Chip label={`Budget Total ${formatCurrency(totalBudgetCents)}`} color="primary" />
              </Box>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="h6" component="h2">
                  Recurring Inputs
                </Typography>
                <RecurringValueDialogButton
                  mode="add"
                  action={createRecurringValue}
                  householdId={household?.id ?? ''}
                  year={selectedYear}
                  startMonth={selectedMonth}
                  categories={childCategories}
                />
              </Box>
              <TableContainer>
                <Table size="small" aria-label="recurring input constants">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Group</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell>Billing</TableCell>
                      <TableCell align="right">Effective From</TableCell>
                      <TableCell align="right">Bill Amount</TableCell>
                      <TableCell align="right">Monthly Planning</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recurringInputRows.map((value) => (
                      <TableRow key={value.id}>
                        <TableCell>{value.name}</TableCell>
                        <TableCell>{value.groupName}</TableCell>
                        <TableCell>{value.categoryName}</TableCell>
                        <TableCell>
                          {value.billing_frequency === 'yearly' ? 'Yearly' : 'Monthly'}
                        </TableCell>
                        <TableCell align="right">{getMonthLabel(value.effective_start_month)}</TableCell>
                        <TableCell align="right">{formatCurrency(value.effective_bill_amount_cents)}</TableCell>
                        <TableCell align="right">{formatCurrency(value.calculated_amount_cents)}</TableCell>
                        <TableCell align="right">
                          <RecurringValueDialogButton
                            mode="edit"
                            action={updateFixedRecurringValue}
                            deleteAction={deleteRecurringValue}
                            householdId={household?.id ?? ''}
                            year={selectedYear}
                            startMonth={selectedMonth}
                            categories={childCategories}
                            value={value}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="h6" component="h2">
                  Recurring Formulas
                </Typography>
                <FormulaDialogButton
                  mode="add"
                  action={createRecurringFormula}
                  householdId={household?.id ?? ''}
                  categories={childCategories}
                  fixedOptions={recurringInputRows}
                />
              </Box>
              <TableContainer>
                <Table size="small" aria-label="recurring formula constants">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Group</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell>Formula</TableCell>
                      <TableCell align="right">Monthly Planning</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recurringFormulaRows.map((value) => (
                      <TableRow key={value.id}>
                        <TableCell>{value.name}</TableCell>
                        <TableCell>{value.groupName}</TableCell>
                        <TableCell>{value.categoryName}</TableCell>
                        <TableCell>{formatFormulaDescription(value)}</TableCell>
                        <TableCell align="right">{formatCurrency(value.calculated_amount_cents)}</TableCell>
                        <TableCell align="right">
                          <FormulaDialogButton
                            mode="edit"
                            action={updateRecurringFormula}
                            deleteAction={deleteRecurringValue}
                            householdId={household?.id ?? ''}
                            categories={childCategories}
                            fixedOptions={recurringInputRows}
                            value={value}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="h6" component="h2">
                  Tags
                </Typography>
                <TagDialogButton mode="add" action={createTag} householdId={household?.id ?? ''} />
              </Box>
              <TableContainer>
                <Table size="small" aria-label="tag settings">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Color</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tags.map((tag) => (
                      <TableRow key={tag.id}>
                        <TableCell>{tag.name}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ width: 18, height: 18, borderRadius: 0.5, border: '1px solid #dadce0', bgcolor: tag.color ?? '#fff' }} />
                            {tag.color ?? ''}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <TagDialogButton
                            mode="edit"
                            action={updateTag}
                            deleteAction={deleteTag}
                            householdId={household?.id ?? ''}
                            tag={tag}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        )}
        {trailingContent ? <Box sx={{ mt: 3 }}>{trailingContent}</Box> : null}
      </Box>
  );

  return embedded ? content : (
    <Container maxWidth="lg">
      {content}
    </Container>
  );
}
