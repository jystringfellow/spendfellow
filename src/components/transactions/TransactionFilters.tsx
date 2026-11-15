'use client';

import { Box, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { transactionFilterHref, type TransactionFilterValues } from '@/lib/transactionFilters';

interface Props {
  values: TransactionFilterValues;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

export default function TransactionFilters({ values, accounts, categories }: Props) {
  const router = useRouter();
  const chips: { key: keyof TransactionFilterValues; label: string }[] = [
    ...(values.q ? [{ key: 'q' as const, label: `Search: ${values.q}` }] : []),
    ...(values.from ? [{ key: 'from' as const, label: `From: ${values.from}` }] : []),
    ...(values.to ? [{ key: 'to' as const, label: `To: ${values.to}` }] : []),
    ...(values.accountId ? [{ key: 'accountId' as const, label: `Account: ${accounts.find((account) => account.id === values.accountId)?.name ?? 'Selected account'}` }] : []),
    ...(values.categoryId ? [{ key: 'categoryId' as const, label: `Category: ${values.categoryId === 'uncategorized' ? 'Uncategorized' : categories.find((category) => category.id === values.categoryId)?.name ?? 'Selected category'}` }] : []),
  ];
  return (
    <Stack spacing={2}>
      <Box component="nav" aria-label="Transaction views" sx={{ display: 'flex', gap: 1 }}>
        <Button component={Link} href={transactionFilterHref(values, { categoryId: null })}
          variant={!values.categoryId ? 'contained' : 'text'} aria-current={!values.categoryId ? 'page' : undefined}>All transactions</Button>
        <Button component={Link} href={transactionFilterHref(values, { categoryId: 'uncategorized' })}
          variant={values.categoryId === 'uncategorized' ? 'contained' : 'text'} aria-current={values.categoryId === 'uncategorized' ? 'page' : undefined}>Uncategorized</Button>
      </Box>
      <Box component="form" action="/transactions" method="get" key={JSON.stringify(values)}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <TextField fullWidth size="small" name="q" label="Search transactions" placeholder="Merchant or description" defaultValue={values.q ?? ''} />
            <Button type="submit" variant="outlined" startIcon={<SearchIcon />}>Search</Button>
          </Stack>
          <Box component="details" open={Boolean(values.from || values.to || values.accountId || (values.categoryId && values.categoryId !== 'uncategorized') || (values.sort && values.sort !== 'date') || values.dir === 'asc')}>
            <Typography component="summary" variant="body2" sx={{ cursor: 'pointer', color: 'text.secondary', py: 0.5 }}>Filters and sorting</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, mt: 2 }}>
              <TextField size="small" name="from" label="From" type="date" defaultValue={values.from ?? ''} InputLabelProps={{ shrink: true }} />
              <TextField size="small" name="to" label="To" type="date" defaultValue={values.to ?? ''} InputLabelProps={{ shrink: true }} />
              <TextField size="small" select name="accountId" label="Account" defaultValue={values.accountId ?? ''}>
                <MenuItem value="">All accounts</MenuItem>{accounts.map((account) => <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>)}
              </TextField>
              <TextField size="small" select name="categoryId" label="Category" defaultValue={values.categoryId ?? ''}>
                <MenuItem value="">All categories</MenuItem><MenuItem value="uncategorized">Uncategorized</MenuItem>
                {categories.map((category) => <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>)}
              </TextField>
              <TextField size="small" select name="sort" label="Sort by" defaultValue={values.sort ?? 'date'}>
                <MenuItem value="date">Date</MenuItem><MenuItem value="amount_cents">Amount</MenuItem><MenuItem value="merchant_name">Merchant</MenuItem><MenuItem value="description">Description</MenuItem>
              </TextField>
              <TextField size="small" select name="dir" label="Order" defaultValue={values.dir ?? 'desc'}>
                <MenuItem value="desc">Descending</MenuItem><MenuItem value="asc">Ascending</MenuItem>
              </TextField>
            </Box>
            <Button type="submit" variant="outlined" sx={{ mt: 2 }}>Apply filters</Button>
          </Box>
        </Stack>
      </Box>
      {chips.length ? <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" aria-label="Active filters">
        {chips.map(({ key, label }) => <Chip key={key} size="small" label={label} onDelete={() => router.push(transactionFilterHref(values, { [key]: null }))} />)}
        <Button size="small" component={Link} href="/transactions">Clear filters</Button>
      </Stack> : null}
    </Stack>
  );
}
