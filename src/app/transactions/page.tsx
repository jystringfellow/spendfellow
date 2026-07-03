import { redirect } from 'next/navigation';
import {
  Box,
  Container,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import SyncTransactionsButton from '@/components/transactions/SyncTransactionsButton';
import CategorizationModeButton from '@/components/transactions/CategorizationModeButton';
import TransactionsTable, { EditableTransactionRow } from '@/components/transactions/TransactionsTable';
import { getCurrentHousehold } from '@/lib/households';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { Category, Tag, TransactionTag } from '@/types/database';

export default async function TransactionsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getCurrentHousehold(supabase);
  const [{ data: transactionRows }, { data: uncategorizedRows }, { data: categoryRows }, { data: tagRows }] = household
    ? await Promise.all([
        supabase
          .from('transactions')
          .select('*, accounts(name)')
          .eq('household_id', household.id)
          .order('date', { ascending: false })
          .limit(100),
        supabase
          .from('transactions')
          .select('*, accounts(name)')
          .eq('household_id', household.id)
          .is('category_id', null)
          .order('date', { ascending: true }),
        supabase
          .from('categories')
          .select('id, name')
          .eq('household_id', household.id)
          .eq('is_group', false)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        supabase.from('tags').select('id, name, color').eq('household_id', household.id).order('name'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const transactionIds = [
    ...(transactionRows ?? []).map((transaction) => transaction.id),
    ...(uncategorizedRows ?? []).map((transaction) => transaction.id),
  ];
  const { data: transactionTagRows } =
    household && transactionIds.length > 0
      ? await supabase.from('transaction_tags').select('transaction_id, tag_id').in('transaction_id', transactionIds)
      : { data: [] };
  const { data: transactionSplitRows } =
    household && transactionIds.length > 0
      ? await supabase.from('transaction_splits').select('transaction_id').in('transaction_id', transactionIds)
      : { data: [] };
  const tagIdsByTransactionId = new Map<string, string[]>();
  ((transactionTagRows ?? []) as TransactionTag[]).forEach((transactionTag) => {
    const currentTagIds = tagIdsByTransactionId.get(transactionTag.transaction_id) ?? [];
    tagIdsByTransactionId.set(transactionTag.transaction_id, [...currentTagIds, transactionTag.tag_id]);
  });
  const splitCountByTransactionId = new Map<string, number>();
  (transactionSplitRows ?? []).forEach((transactionSplit) => {
    splitCountByTransactionId.set(
      transactionSplit.transaction_id,
      (splitCountByTransactionId.get(transactionSplit.transaction_id) ?? 0) + 1
    );
  });
  const transactions = (transactionRows ?? []).map((transaction) => ({
    ...transaction,
    transaction_tag_ids: tagIdsByTransactionId.get(transaction.id) ?? [],
    transaction_split_count: splitCountByTransactionId.get(transaction.id) ?? 0,
  })) as EditableTransactionRow[];
  const uncategorizedTransactions = (uncategorizedRows ?? [])
    .map((transaction) => ({
      ...transaction,
      transaction_tag_ids: tagIdsByTransactionId.get(transaction.id) ?? [],
      transaction_split_count: splitCountByTransactionId.get(transaction.id) ?? 0,
    }))
    .filter((transaction) => transaction.transaction_split_count === 0) as EditableTransactionRow[];
  const categories = (categoryRows ?? []) as Pick<Category, 'id' | 'name'>[];
  const tags = (tagRows ?? []) as Pick<Tag, 'id' | 'name' | 'color'>[];

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              Transactions
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Sync Plaid transactions and review uncategorized spend before it rolls into budget views.
            </Typography>
          </Box>
          {household ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
              <CategorizationModeButton transactions={uncategorizedTransactions} categories={categories} tags={tags} />
              <SyncTransactionsButton />
            </Stack>
          ) : null}
        </Stack>

        <Paper sx={{ p: 0, overflow: 'hidden' }}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6">Latest transactions</Typography>
            <Typography variant="body2" color="text.secondary">
              Showing the 100 most recent transactions. Save changes per row as you categorize and annotate.
            </Typography>
          </Box>
          <Divider />
          {transactions.length > 0 ? (
            <TransactionsTable transactions={transactions} categories={categories} tags={tags} />
          ) : (
            <Box sx={{ p: 3 }}>
              <Typography color="text.secondary">No transactions synced yet.</Typography>
            </Box>
          )}
        </Paper>
      </Box>
    </Container>
  );
}
