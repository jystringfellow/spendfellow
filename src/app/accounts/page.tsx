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
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import PlaidItemActions from '@/components/accounts/PlaidItemActions';
import PlaidLinkButton from '@/components/accounts/PlaidLinkButton';
import RefreshAccountsButton from '@/components/accounts/RefreshAccountsButton';
import SyncTransactionsButton from '@/components/transactions/SyncTransactionsButton';
import { getAccountTransactionRole } from '@/lib/accountTypes';
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

function getDefaultPlaidEnvironment(): 'sandbox' | 'development' | 'production' {
  if (
    process.env.PLAID_ENV === 'sandbox' ||
    process.env.PLAID_ENV === 'development' ||
    process.env.PLAID_ENV === 'production'
  ) {
    return process.env.PLAID_ENV;
  }

  return 'sandbox';
}

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

function formatSyncRun(run: PlaidSyncRun | undefined): string {
  if (!run) {
    return 'Never';
  }

  const finishedAt = run.finished_at ?? run.created_at;
  const countText =
    run.sync_type === 'transactions'
      ? `${run.imported_count} imported`
      : run.status === 'skipped'
        ? 'skipped'
        : `${run.imported_count} accounts`;
  return `${run.status} - ${countText} - ${new Date(finishedAt).toLocaleString()}`;
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
  const latestTransactionRunByAccountId = getLatestRunByKey(
    syncRuns.filter((run) => run.sync_type === 'transactions' && run.account_id),
    (run) => run.account_id
  );
  const latestBalanceRunByAccountId = getLatestRunByKey(
    syncRuns.filter((run) => run.sync_type === 'balances' && run.account_id),
    (run) => run.account_id
  );
  const latestBalanceRunByPlaidItemId = getLatestRunByKey(
    syncRuns.filter((run) => run.sync_type === 'balances'),
    (run) => run.plaid_item_id
  );
  const defaultPlaidEnvironment = getDefaultPlaidEnvironment();

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              Accounts
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Connect financial institutions and review the account balances imported from Plaid.
            </Typography>
          </Box>
          {household ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
              <PlaidLinkButton defaultEnvironment={defaultPlaidEnvironment} />
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
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Linked institutions
              </Typography>
              {items.length > 0 ? (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Institution</TableCell>
                      <TableCell>Environment</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Last transaction sync</TableCell>
                      <TableCell>Last balance sync</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((item) => {
                      const institutionName = item.institution_name ?? item.institution_id ?? item.plaid_item_id;

                      return (
                        <TableRow key={item.id}>
                          <TableCell>{institutionName}</TableCell>
                          <TableCell>
                            {item.plaid_environment ? (
                              <Chip size="small" variant="outlined" label={item.plaid_environment} />
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={item.status}
                              color={item.status === 'active' ? 'success' : 'default'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>{formatSyncRun(latestTransactionRunByPlaidItemId.get(item.plaid_item_id))}</TableCell>
                          <TableCell>{formatSyncRun(latestBalanceRunByPlaidItemId.get(item.plaid_item_id))}</TableCell>
                          <TableCell align="right">
                            {item.status === 'active' ? (
                              <PlaidItemActions itemId={item.id} institutionName={institutionName} />
                            ) : (
                              '-'
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <Typography color="text.secondary">No institutions connected yet.</Typography>
              )}
            </Paper>

            <Paper sx={{ p: 0, overflow: 'hidden' }}>
              <Box sx={{ p: 3 }}>
                <Typography variant="h6">Accounts</Typography>
                <Typography variant="body2" color="text.secondary">
                  Current and available balances come from Plaid account data. Refresh balances to update these values
                  without syncing transactions. Depository and credit accounts are used for spending transactions;
                  investment and loan accounts are balance-only for now.
                </Typography>
              </Box>
              <Divider />
              {accounts.length > 0 ? (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell align="right">Current</TableCell>
                      <TableCell align="right">Available</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Transaction sync</TableCell>
                      <TableCell>Environment</TableCell>
                      <TableCell>Balance sync</TableCell>
                      <TableCell>Last transaction sync</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography fontWeight={600}>{account.name}</Typography>
                            {account.official_name ? (
                              <Typography variant="body2" color="text.secondary">
                                {account.official_name}
                              </Typography>
                            ) : null}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography>{account.type}</Typography>
                          {account.subtype ? (
                            <Typography variant="body2" color="text.secondary">
                              {account.subtype}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell align="right">
                          {account.current_balance_cents === null
                            ? '-'
                            : formatCurrency(account.current_balance_cents, account.currency_code)}
                        </TableCell>
                        <TableCell align="right">
                          {account.available_balance_cents === null
                            ? '-'
                            : formatCurrency(account.available_balance_cents, account.currency_code)}
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={account.is_active ? 'Active' : 'Inactive'} />
                        </TableCell>
                        <TableCell>
                          {getAccountTransactionRole(account) === 'spending' ? (
                            <Chip size="small" color="success" variant="outlined" label="Spending" />
                          ) : (
                            <Chip size="small" variant="outlined" label="Balance only" />
                          )}
                        </TableCell>
                        <TableCell>
                          {account.plaid_environment ? (
                            <Chip size="small" variant="outlined" label={account.plaid_environment} />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {formatSyncRun(latestBalanceRunByAccountId.get(account.id))}
                        </TableCell>
                        <TableCell>
                          {getAccountTransactionRole(account) === 'spending'
                            ? formatSyncRun(
                                latestTransactionRunByAccountId.get(account.id) ??
                                  latestTransactionRunByPlaidItemId.get(account.plaid_item_id ?? '')
                              )
                            : '-'}
                        </TableCell>
                        <TableCell align="right">
                          {account.is_active && account.plaid_account_id ? (
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              {getAccountTransactionRole(account) === 'spending' ? (
                                <SyncTransactionsButton
                                  accountIds={[account.id]}
                                  label="Sync"
                                  size="small"
                                  variant="text"
                                />
                              ) : null}
                              <RefreshAccountsButton
                                accountIds={[account.id]}
                                label="Balance"
                                refreshedLabel="Done"
                                size="small"
                                variant="text"
                              />
                            </Stack>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Box sx={{ p: 3 }}>
                  <Typography color="text.secondary">
                    No accounts imported yet. Use Connect account to start Plaid Link.
                  </Typography>
                </Box>
              )}
            </Paper>
          </Stack>
        )}
      </Box>
    </Container>
  );
}
