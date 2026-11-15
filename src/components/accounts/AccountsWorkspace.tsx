'use client';

import { Children, createContext, isValidElement, useContext, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Paper, Stack, TableBody, Typography } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import TuneIcon from '@mui/icons-material/Tune';
import SyncTransactionsButton from '@/components/transactions/SyncTransactionsButton';

interface AccountOption { id: string; name: string; institutionId: string | null; syncable: boolean }
interface InstitutionOption { id: string; name: string }
interface Preferences { accounts: string[]; institutions: string[]; selected?: string[] }
const OrderContext = createContext<Preferences>({ accounts: [], institutions: [] });
const emptySnapshot = () => '';
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}
function sortByIds<T>(entries: T[], ids: string[], id: (entry: T) => string) {
  const positions = new Map(ids.map((value, index) => [value, index]));
  return [...entries].sort((a, b) => (positions.get(id(a)) ?? ids.length) - (positions.get(id(b)) ?? ids.length));
}
function parsePreferences(value: string): Preferences {
  try {
    const data = JSON.parse(value);
    const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
    return { accounts: strings(data.accounts), institutions: strings(data.institutions), selected: Array.isArray(data.selected) ? strings(data.selected) : undefined };
  } catch { return { accounts: [], institutions: [] }; }
}

export default function AccountsWorkspace({ storageKey, accounts, institutions, children }: {
  storageKey: string; accounts: AccountOption[]; institutions: InstitutionOption[]; children?: ReactNode;
}) {
  const [memory, setMemory] = useState('');
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const snapshot = useSyncExternalStore(subscribe, () => {
    if (storageUnavailable) return memory;
    try { return window.localStorage.getItem(storageKey) ?? memory; } catch { return memory; }
  }, emptySnapshot);
  const preferences = useMemo(() => parsePreferences(snapshot), [snapshot]);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [draftSelected, setDraftSelected] = useState<string[]>([]);
  const [draftOrder, setDraftOrder] = useState<Preferences>({ accounts: [], institutions: [] });
  const syncable = accounts.filter((account) => account.syncable);
  const eligibleIds = new Set(syncable.map((account) => account.id));
  const selected = (preferences.selected ?? syncable.map((account) => account.id)).filter((id) => eligibleIds.has(id));
  const orderedInstitutions = sortByIds(institutions, preferences.institutions, (item) => item.id);
  function persist(next: Preferences) {
    const value = JSON.stringify(next);
    try { window.localStorage.setItem(storageKey, value); } catch { setStorageUnavailable(true); }
    setMemory(value);
  }
  function move(ids: string[], id: string, direction: number) {
    const next = [...ids];
    const index = next.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return ids;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
  function orderControls(ids: string[], id: string, name: string, update: (next: string[]) => void) {
    return <Stack direction="row">
      <IconButton size="small" aria-label={`Move ${name} up`} disabled={ids.indexOf(id) === 0} onClick={() => update(move(ids, id, -1))}><ArrowUpwardIcon fontSize="small" /></IconButton>
      <IconButton size="small" aria-label={`Move ${name} down`} disabled={ids.indexOf(id) === ids.length - 1} onClick={() => update(move(ids, id, 1))}><ArrowDownwardIcon fontSize="small" /></IconButton>
    </Stack>;
  }
  return <OrderContext.Provider value={preferences}>
    <Paper sx={{ p: { xs: 2, sm: 2.5 }, mb: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
        <Box>
          <Typography variant="h6" component="h2">Your transaction sync group</Typography>
          <Typography variant="body2" color="text.secondary">{selected.length} of {syncable.length} eligible accounts selected. Loans and investments are balance-only.</Typography>
          <Typography variant="caption" color="text.secondary">{storageUnavailable ? 'Selection and display order are saved for this session only.' : 'Selection and display order are remembered in this browser.'}</Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
          <Button onClick={() => { setDraftSelected(selected); setSelectionOpen(true); }}>Choose accounts</Button>
          <Button startIcon={<TuneIcon />} onClick={() => {
            setDraftOrder({ ...preferences, institutions: orderedInstitutions.map((item) => item.id), accounts: sortByIds(accounts, preferences.accounts, (account) => account.id).map((account) => account.id) });
            setArrangeOpen(true);
          }}>Arrange</Button>
          <SyncTransactionsButton accountIds={selected} disabled={selected.length === 0} label={`Sync selected (${selected.length})`} />
        </Stack>
      </Stack>
    </Paper>
    {children}
    <Dialog open={selectionOpen} onClose={() => setSelectionOpen(false)} fullWidth maxWidth="sm" aria-labelledby="sync-selection-title">
      <DialogTitle id="sync-selection-title">Choose accounts to sync together</DialogTitle>
      <DialogContent dividers>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Choose checking, savings, and credit accounts for your regular transaction sync.</Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button onClick={() => setDraftSelected(syncable.map((account) => account.id))}>Select all eligible</Button>
          <Button onClick={() => setDraftSelected([])}>Clear selection</Button>
        </Stack>
        {orderedInstitutions.map((institution) => <Box key={institution.id} sx={{ mb: 2 }}>
          <Typography variant="subtitle2">{institution.name}</Typography>
          <Stack>{sortByIds(accounts.filter((account) => account.institutionId === institution.id), preferences.accounts, (account) => account.id).map((account) => (
            <FormControlLabel key={account.id} control={<Checkbox checked={draftSelected.includes(account.id)} disabled={!account.syncable} onChange={(_event, checked) => setDraftSelected((ids) => checked ? [...ids, account.id] : ids.filter((id) => id !== account.id))} />}
              label={<Stack direction="row" spacing={1} alignItems="center"><Typography>{account.name}</Typography>{!account.syncable ? <Chip size="small" variant="outlined" label="Balance only" /> : null}</Stack>} />
          ))}</Stack>
        </Box>)}
        {!syncable.length ? <Typography color="text.secondary">Connect an institution with an eligible account to sync transactions.</Typography> : null}
      </DialogContent>
      <DialogActions><Button onClick={() => setSelectionOpen(false)}>Cancel</Button><Button variant="contained" onClick={() => { persist({ ...preferences, selected: draftSelected.filter((id) => eligibleIds.has(id)) }); setSelectionOpen(false); }}>Save selection</Button></DialogActions>
    </Dialog>
    <Dialog open={arrangeOpen} onClose={() => setArrangeOpen(false)} fullWidth maxWidth="sm" aria-labelledby="account-order-title">
      <DialogTitle id="account-order-title">Arrange accounts</DialogTitle>
      <DialogContent dividers>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Move institutions and their accounts into the order you prefer.</Typography>
        {[...sortByIds(institutions, draftOrder.institutions, (item) => item.id), ...(accounts.some((account) => !account.institutionId) ? [{ id: 'unlinked', name: 'Manual and other accounts' }] : [])].map((institution) => {
          const rows = sortByIds(accounts.filter((account) => institution.id === 'unlinked' ? !account.institutionId : account.institutionId === institution.id), draftOrder.accounts, (account) => account.id);
          const rowIds = rows.map((account) => account.id);
          return <Box key={institution.id} sx={{ mb: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={700}>{institution.name}</Typography>{institution.id !== 'unlinked' ? orderControls(draftOrder.institutions, institution.id, institution.name, (institutions) => setDraftOrder((value) => ({ ...value, institutions }))) : null}</Stack>
            {rows.map((account) => <Stack key={account.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ pl: 2, py: 0.5 }}>
              <Typography>{account.name}</Typography>
              {orderControls(rowIds, account.id, account.name, (next) => setDraftOrder((value) => {
                const ordered = [...next, ...value.accounts.filter((id) => !rowIds.includes(id))];
                return { ...value, accounts: ordered };
              }))}
            </Stack>)}
          </Box>;
        })}
      </DialogContent>
      <DialogActions><Button onClick={() => setArrangeOpen(false)}>Cancel</Button><Button variant="contained" onClick={() => { persist({ ...draftOrder, selected: preferences.selected }); setArrangeOpen(false); }}>Save order</Button></DialogActions>
    </Dialog>
  </OrderContext.Provider>;
}

export function OrderedAccountRows({ children }: { children: ReactNode }) {
  const { accounts } = useContext(OrderContext);
  return <TableBody>{sortByIds(Children.toArray(children), accounts, (child) => isValidElement<{ 'data-account-id': string }>(child) ? child.props['data-account-id'] : '')}</TableBody>;
}

export function OrderedInstitutions({ children }: { children: ReactNode }) {
  const { institutions } = useContext(OrderContext);
  return <>{sortByIds(Children.toArray(children), institutions, (child) => isValidElement<{ orderId: string }>(child) ? child.props.orderId : '')}</>;
}
