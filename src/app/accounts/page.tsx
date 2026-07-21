import { redirect } from 'next/navigation';
import {
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import AccountBalanceCategorySelect from '@/components/accounts/AccountBalanceCategorySelect';
import AccountNameEditor from '@/components/accounts/AccountNameEditor';
import ManualAccountDialog from '@/components/accounts/ManualAccountDialog';
import {
  CollapsibleSection,
  LinkedInstitutionCard,
  LinkedInstitutionCollapseProvider,
} from '@/components/accounts/LinkedInstitutionCard';
import PlaidItemActions from '@/components/accounts/PlaidItemActions';
import PlaidLinkButton from '@/components/accounts/PlaidLinkButton';
import RefreshAccountsButton from '@/components/accounts/RefreshAccountsButton';
import SyncTransactionsButton from '@/components/transactions/SyncTransactionsButton';
import {
  ACCOUNT_BALANCE_CATEGORY_OPTIONS,
  getAccountBalanceCategory,
  getAccountBalanceCategoryLabel,
  inferAccountBalanceCategory,
} from '@/lib/accountBalanceCategories';
import { getCurrentHousehold } from '@/lib/households';
import { formatCurrency } from '@/lib/money';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { Account, PlaidItem, PlaidSyncRun } from '@/types/database';

type PlaidItemSummary = Pick<
  PlaidItem,
  | 'id'
  | 'household_id'
  | 'plaid_item_id'
  | 'plaid_environment'
  | 'institution_id'
  | 'institution_name'
  | 'status'
  | 'error_code'
  | 'last_sync_at'
  | 'created_at'
  | 'updated_at'
>;

function getLatestRunByKey(runs: PlaidSyncRun[], getKey: (run: PlaidSyncRun) => string | null) {
  const latestRunByKey = new Map<string, PlaidSyncRun>();

  runs.forEach((run) => {
    const key = getKey(run);
    if (!key || latestRunByKey.has(key)) {
      return;
    }

    latestRunByKey.set(key, run);
  });

  return latestRunByKey;
}

function formatSyncedAt(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function getRunTooltip(run: PlaidSyncRun | undefined): string {
  if (!run) {
    return 'Never synced.';
  }

  const finishedAt = formatSyncedAt(run.finished_at ?? run.created_at);
  const count =
    run.sync_type === 'transactions'
      ? `${run.imported_count} imported, ${run.skipped_count} skipped`
      : `${run.imported_count} accounts imported, ${run.skipped_count} skipped`;
  const error = run.error_message ? `\n${run.error_message}` : '';

  return `${run.status} - ${count}\n${finishedAt}${error}`;
}

function getInstitutionInfo(
  item: PlaidItemSummary,
  latestBalanceRun: PlaidSyncRun | undefined,
  latestTransactionRun: PlaidSyncRun | undefined
) {
  const environment =
    item.plaid_environment === 'production'
      ? 'prod'
      : item.plaid_environment === 'sandbox'
        ? 'sandbox'
        : item.plaid_environment ?? 'Unknown';

  return (
    <Box sx={{ whiteSpace: 'pre-line' }}>
      {`Environment: ${environment}
Last balance sync: ${getRunTooltip(latestBalanceRun)}
Last transaction sync: ${getRunTooltip(latestTransactionRun)}`}
    </Box>
  );
}

function getInstitutionName(item: PlaidItemSummary): string {
  return item.institution_name ?? item.institution_id ?? item.plaid_item_id;
}

function getAccountsForItem(accounts: Account[], item: PlaidItemSummary): Account[] {
  return accounts.filter(
    (account) => account.plaid_item_id === item.plaid_item_id && account.plaid_environment === item.plaid_environment
  );
}

function getOtherAccounts(accounts: Account[], items: PlaidItemSummary[]): Account[] {
  const itemKeys = new Set(items.map((item) => `${item.plaid_environment ?? 'unknown'}:${item.plaid_item_id}`));

  return accounts.filter(
    (account) =>
      account.source !== 'manual' &&
      !itemKeys.has(`${account.plaid_environment ?? 'unknown'}:${account.plaid_item_id ?? ''}`)
  );
}

function getBalanceCategorySummaries(accounts: Account[]) {
  return ACCOUNT_BALANCE_CATEGORY_OPTIONS.map((option) => {
    const categoryAccounts = accounts.filter(
      (account) => account.is_active && getAccountBalanceCategory(account) === option.value
    );
    const totalCents = categoryAccounts.reduce(
      (total, account) =>
        total +
        (option.value === 'ccDebt'
          ? -Math.abs(account.current_balance_cents ?? 0)
          : Math.abs(account.current_balance_cents ?? 0)),
      0
    );

    return {
      ...option,
      accounts: categoryAccounts,
      totalCents,
    };
  });
}

function getAccountWarnings(account: Account): string[] {
  const category = getAccountBalanceCategory(account);
  const warnings: string[] = [];

  if (category === 'hidden') {
    return warnings;
  }

  if (account.type === 'credit' && category && category !== 'ccDebt') {
    warnings.push('Credit account mapped outside CC Debt');
  }

  if (account.type === 'investment' && category && category !== 'investments') {
    warnings.push('Investment account mapped outside Investments');
  }

  if (account.type === 'depository' && (category === 'ccDebt' || category === 'investments')) {
    warnings.push('Depository account mapped to a non-cash category');
  }

  if (account.current_balance_cents === null) {
    warnings.push('Missing current balance');
  }

  return warnings;
}

export default async function AccountsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getCurrentHousehold(supabase);

  const [{ data: accountRows }, { data: itemRows }, { data: syncRunRows }] = household
    ? await Promise.all([
        supabase.from('accounts').select('*').eq('household_id', household.id).order('name'),
        supabase
          .from('plaid_items')
          .select(
            'id, household_id, plaid_item_id, plaid_environment, institution_id, institution_name, status, error_code, last_sync_at, created_at, updated_at'
          )
          .eq('household_id', household.id)
          .order('created_at', {
            ascending: false,
          }),
        supabase
          .from('plaid_sync_runs')
          .select('*')
          .eq('household_id', household.id)
          .order('created_at', { ascending: false })
          .limit(200),
      ])
    : [{ data: [] as Account[] }, { data: [] as PlaidItemSummary[] }, { data: [] as PlaidSyncRun[] }];
  const accounts = (accountRows ?? []) as Account[];
  const items = (itemRows ?? []) as PlaidItemSummary[];
  const syncRuns = (syncRunRows ?? []) as PlaidSyncRun[];
  const latestTransactionRunByPlaidItemId = getLatestRunByKey(
    syncRuns.filter((run) => run.sync_type === 'transactions'),
    (run) => run.plaid_item_id
  );
  const latestBalanceRunByPlaidItemId = getLatestRunByKey(
    syncRuns.filter((run) => run.sync_type === 'balances'),
    (run) => run.plaid_item_id
  );
  const balanceCategorySummaries = getBalanceCategorySummaries(accounts);
  const manualAccounts = accounts.filter((account) => account.source === 'manual');
  const otherAccounts = getOtherAccounts(accounts, items);
  const activeItems = items.filter((item) => item.status === 'active');
  const inactiveItems = items.filter((item) => item.status !== 'active');

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              Accounts
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Connect financial institutions and manage balances imported from Plaid or tracked manually.
            </Typography>
          </Box>
          {household ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
              <ManualAccountDialog />
              <RefreshAccountsButton />
              <PlaidLinkButton />
            </Stack>
          ) : null}
        </Stack>

        {!household ? (
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2} alignItems="flex-start">
              <Typography variant="h6">Create your household first</Typography>
              <Typography color="text.secondary">
                Plaid accounts are shared at the household level, so initialize your household before connecting an
                institution.
              </Typography>
              <Button component={Link} href="/settings" variant="contained">
                Go to settings
              </Button>
            </Stack>
          </Paper>
        ) : (
          <Stack spacing={3}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
              {balanceCategorySummaries.map((summary) => (
                <Paper key={summary.value} sx={{ p: 2 }}>
                  <Stack spacing={0.75}>
                    <Typography variant="body2" color="text.secondary">
                      {summary.label}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                      {formatCurrency(summary.totalCents)}
                    </Typography>
                  </Stack>
                </Paper>
              ))}
            </Box>

            <Stack spacing={2}>
              {manualAccounts.length > 0 ? (
                <Paper sx={{ overflow: 'hidden' }}>
                  <Box sx={{ p: 2.5 }}>
                    <Typography variant="h6">Manual accounts</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Balances update as you add, edit, or delete manual transactions.
                    </Typography>
                  </Box>
                  <Divider />
                  <TableContainer>
                    <Table size="small" sx={{ minWidth: 680 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Account</TableCell>
                          <TableCell align="right">Balance</TableCell>
                          <TableCell>Budget Balance</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {manualAccounts.map((account) => (
                          <TableRow key={account.id}>
                            <TableCell>
                              <Stack spacing={0.5}>
                                <AccountNameEditor accountId={account.id} name={account.name} officialName={null} />
                                <Chip size="small" variant="outlined" label="Manual cash" sx={{ alignSelf: 'flex-start' }} />
                              </Stack>
                            </TableCell>
                            <TableCell align="right">
                              {formatCurrency(account.current_balance_cents ?? 0, account.currency_code)}
                            </TableCell>
                            <TableCell>
                              <AccountBalanceCategorySelect
                                accountId={account.id}
                                value={account.balance_category}
                                inferredValue={inferAccountBalanceCategory(account)}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              ) : null}

              <Box>
                <Typography variant="h6">Linked institutions</Typography>
                <Typography variant="body2" color="text.secondary">
                  Manage connections by institution, then choose how each account rolls into the budget sheet.
                </Typography>
              </Box>

              {activeItems.length > 0 ? (
                <LinkedInstitutionCollapseProvider>
                  {activeItems.map((item) => {
                    const institutionName = getInstitutionName(item);
                    const itemAccounts = getAccountsForItem(accounts, item);
                    const itemAccountIds = itemAccounts.map((account) => account.id);
                    const latestTransactionRun = latestTransactionRunByPlaidItemId.get(item.plaid_item_id);
                    const latestBalanceRun = latestBalanceRunByPlaidItemId.get(item.plaid_item_id);

                    return (
                      <LinkedInstitutionCard
                        key={item.id}
                        title={institutionName}
                        info={getInstitutionInfo(item, latestBalanceRun, latestTransactionRun)}
                        actions={
                          <>
                            <RefreshAccountsButton
                              accountIds={itemAccountIds}
                              label="Refresh balances"
                              refreshedLabel="Refreshed"
                              size="small"
                            />
                            <SyncTransactionsButton
                              itemIds={[item.id]}
                              label="Sync transactions"
                              size="small"
                              variant="outlined"
                            />
                            <PlaidItemActions itemId={item.id} institutionName={institutionName} />
                          </>
                        }
                      >
                        {itemAccounts.length > 0 ? (
                          <TableContainer>
                            <Table size="small" sx={{ minWidth: 640 }}>
                              <TableHead>
                                <TableRow>
                                  <TableCell>Account</TableCell>
                                  <TableCell align="right">Balance</TableCell>
                                  <TableCell>Budget Balance</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {itemAccounts.map((account) => {
                                  const warnings = getAccountWarnings(account);
                                  const category = getAccountBalanceCategory(account);

                                  return (
                                    <TableRow key={account.id}>
                                      <TableCell>
                                        <Stack spacing={0.75}>
                                          <AccountNameEditor
                                            accountId={account.id}
                                            name={account.name}
                                            officialName={account.official_name}
                                          />
                                          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                            <Tooltip title={`${account.type}${account.subtype ? ` / ${account.subtype}` : ''}`}>
                                              <Chip size="small" variant="outlined" label={account.subtype ?? account.type} />
                                            </Tooltip>
                                            {warnings.map((warning) => (
                                              <Tooltip key={warning} title={warning}>
                                                <Chip size="small" color="warning" variant="outlined" label="Check" />
                                              </Tooltip>
                                            ))}
                                          </Stack>
                                        </Stack>
                                      </TableCell>
                                      <TableCell align="right">
                                      {account.current_balance_cents === null
                                        ? '-'
                                        : formatCurrency(account.current_balance_cents, account.currency_code)}
                                    </TableCell>
                                    <TableCell>
                                      <Stack spacing={0.75}>
                                        <AccountBalanceCategorySelect
                                            accountId={account.id}
                                            value={account.balance_category}
                                            inferredValue={inferAccountBalanceCategory(account)}
                                          />
                                          <Typography variant="caption" color="text.secondary">
                                            Shows as {getAccountBalanceCategoryLabel(category)}
                                          </Typography>
                                        </Stack>
                                      </TableCell>
                                  </TableRow>
                                );
                              })}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        ) : (
                          <Box sx={{ p: 2.5 }}>
                            <Typography color="text.secondary">
                              No accounts are currently associated with this institution.
                            </Typography>
                          </Box>
                        )}
                      </LinkedInstitutionCard>
                    );
                  })}
                </LinkedInstitutionCollapseProvider>
              ) : items.length > 0 ? (
                <Paper sx={{ p: 3 }}>
                  <Typography color="text.secondary">No active institutions connected.</Typography>
                </Paper>
              ) : (
                <Paper sx={{ p: 3 }}>
                  <Typography color="text.secondary">No institutions connected yet.</Typography>
                </Paper>
              )}

              {inactiveItems.length > 0 || otherAccounts.length > 0 ? (
                <CollapsibleSection
                  title="Inactive"
                  description="Disconnected institutions and accounts without an active linked institution."
                >
                  <Stack spacing={2} sx={{ p: 2 }}>
                    {inactiveItems.map((item) => {
                      const institutionName = getInstitutionName(item);
                      const itemAccounts = getAccountsForItem(accounts, item);
                      const latestTransactionRun = latestTransactionRunByPlaidItemId.get(item.plaid_item_id);
                      const latestBalanceRun = latestBalanceRunByPlaidItemId.get(item.plaid_item_id);

                      return (
                        <LinkedInstitutionCard
                          key={item.id}
                          title={institutionName}
                          info={getInstitutionInfo(item, latestBalanceRun, latestTransactionRun)}
                          actions={<PlaidItemActions itemId={item.id} institutionName={institutionName} />}
                          defaultOpen={false}
                        >
                          {itemAccounts.length > 0 ? (
                            <TableContainer>
                              <Table size="small" sx={{ minWidth: 640 }}>
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Account</TableCell>
                                    <TableCell align="right">Balance</TableCell>
                                    <TableCell>Budget Balance</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {itemAccounts.map((account) => {
                                    const warnings = getAccountWarnings(account);
                                    const category = getAccountBalanceCategory(account);

                                    return (
                                      <TableRow key={account.id}>
                                        <TableCell>
                                          <Stack spacing={0.75}>
                                            <AccountNameEditor
                                              accountId={account.id}
                                              name={account.name}
                                              officialName={account.official_name}
                                            />
                                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                              <Tooltip title={`${account.type}${account.subtype ? ` / ${account.subtype}` : ''}`}>
                                                <Chip size="small" variant="outlined" label={account.subtype ?? account.type} />
                                              </Tooltip>
                                              {warnings.map((warning) => (
                                                <Tooltip key={warning} title={warning}>
                                                  <Chip size="small" color="warning" variant="outlined" label="Check" />
                                                </Tooltip>
                                              ))}
                                            </Stack>
                                          </Stack>
                                        </TableCell>
                                        <TableCell align="right">
                                          {account.current_balance_cents === null
                                            ? '-'
                                            : formatCurrency(account.current_balance_cents, account.currency_code)}
                                        </TableCell>
                                        <TableCell>
                                          <Stack spacing={0.75}>
                                            <AccountBalanceCategorySelect
                                              accountId={account.id}
                                              value={account.balance_category}
                                              inferredValue={inferAccountBalanceCategory(account)}
                                            />
                                            <Typography variant="caption" color="text.secondary">
                                              Shows as {getAccountBalanceCategoryLabel(category)}
                                            </Typography>
                                          </Stack>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          ) : (
                            <Box sx={{ p: 2.5 }}>
                              <Typography color="text.secondary">
                                No accounts are currently associated with this institution.
                              </Typography>
                            </Box>
                          )}
                        </LinkedInstitutionCard>
                      );
                    })}

                    {otherAccounts.length > 0 ? (
                      <Paper sx={{ overflow: 'hidden' }}>
                        <Box sx={{ p: 2.5 }}>
                          <Typography variant="h6">Other accounts</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Accounts without an active linked institution.
                          </Typography>
                        </Box>
                        <Divider />
                        <TableContainer>
                          <Table size="small" sx={{ minWidth: 680 }}>
                            <TableHead>
                              <TableRow>
                                <TableCell>Account</TableCell>
                                <TableCell align="right">Balance</TableCell>
                                <TableCell>Budget Balance</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {otherAccounts.map((account) => (
                                <TableRow key={account.id}>
                                  <TableCell>
                                    <AccountNameEditor accountId={account.id} name={account.name} officialName={account.official_name} />
                                  </TableCell>
                                  <TableCell align="right">
                                    {account.current_balance_cents === null
                                      ? '-'
                                      : formatCurrency(account.current_balance_cents, account.currency_code)}
                                  </TableCell>
                                  <TableCell>
                                    <AccountBalanceCategorySelect
                                      accountId={account.id}
                                      value={account.balance_category}
                                      inferredValue={inferAccountBalanceCategory(account)}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Paper>
                    ) : null}
                  </Stack>
                </CollapsibleSection>
              ) : null}
            </Stack>
          </Stack>
        )}
      </Box>
    </Container>
  );
}
