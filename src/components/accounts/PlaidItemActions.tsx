'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import MoreVertIcon from '@mui/icons-material/MoreVert';

interface PlaidItemActionsProps {
  itemId: string;
  institutionName: string;
}

type TransactionCleanupMode = 'keep' | 'delete_all' | 'delete_before';

export default function PlaidItemActions({ itemId, institutionName }: PlaidItemActionsProps) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transactionCleanup, setTransactionCleanup] = useState<TransactionCleanupMode>('keep');
  const [deleteBeforeDate, setDeleteBeforeDate] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeMenu = () => setAnchorEl(null);

  async function handleRemove() {
    if (transactionCleanup === 'delete_before' && !deleteBeforeDate) {
      setError('Choose a cutoff date before removing the linked institution.');
      return;
    }

    setIsRemoving(true);
    setError(null);

    const searchParams = new URLSearchParams({ transaction_cleanup: transactionCleanup });
    if (transactionCleanup === 'delete_before') {
      searchParams.set('delete_before', deleteBeforeDate);
    }

    const response = await fetch(`/api/plaid/items/${itemId}?${searchParams.toString()}`, { method: 'DELETE' });
    const data = (await response.json()) as { error?: string };

    setIsRemoving(false);

    if (!response.ok) {
      setError(data.error ?? 'Unable to remove linked institution.');
      return;
    }

    setConfirmOpen(false);
    router.refresh();
  }

  return (
    <>
      <IconButton
        aria-label={`Actions for ${institutionName}`}
        size="small"
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            setTransactionCleanup('keep');
            setDeleteBeforeDate('');
            setError(null);
            setConfirmOpen(true);
            closeMenu();
          }}
        >
          <LinkOffIcon fontSize="small" sx={{ mr: 1 }} />
          Disconnect
        </MenuItem>
        <MenuItem
          onClick={() => {
            setTransactionCleanup('delete_all');
            setDeleteBeforeDate('');
            setError(null);
            setConfirmOpen(true);
            closeMenu();
          }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Disconnect and delete transactions
        </MenuItem>
      </Menu>

      <Dialog open={confirmOpen} onClose={() => (isRemoving ? undefined : setConfirmOpen(false))} fullWidth maxWidth="sm">
        <DialogTitle>Remove linked institution?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography>
              This will disconnect {institutionName} from Plaid so it can no longer sync new account or transaction data.
            </Typography>
            <FormControl disabled={isRemoving}>
              <RadioGroup
                value={transactionCleanup}
                onChange={(event) => setTransactionCleanup(event.target.value as TransactionCleanupMode)}
              >
                <FormControlLabel
                  value="keep"
                  control={<Radio />}
                  label="Keep all historical transactions and mark accounts inactive"
                />
                <FormControlLabel
                  value="delete_before"
                  control={<Radio />}
                  label="Delete transactions before a cutoff date, then mark accounts inactive"
                />
                <FormControlLabel
                  value="delete_all"
                  control={<Radio />}
                  label="Delete all imported accounts and transactions for this institution"
                />
              </RadioGroup>
            </FormControl>
            {transactionCleanup === 'delete_before' ? (
              <TextField
                label="Delete transactions before"
                type="date"
                value={deleteBeforeDate}
                onChange={(event) => setDeleteBeforeDate(event.target.value)}
                disabled={isRemoving}
                InputLabelProps={{ shrink: true }}
                helperText="Transactions on this date or later are kept."
                fullWidth
              />
            ) : null}
            {transactionCleanup === 'delete_all' ? (
              <Alert severity="warning">
                Deleting imported accounts also deletes their transactions, split rows, transaction tag assignments, and
                notes attached to those transactions. Category and tag definitions are kept.
              </Alert>
            ) : transactionCleanup === 'delete_before' ? (
              <Alert severity="warning">
                Older transactions are deleted, but account rows are kept inactive so remaining transactions still have a
                valid account.
              </Alert>
            ) : (
              <Alert severity="info">
                Existing transactions stay in Spendfellow, but the linked accounts are marked inactive.
              </Alert>
            )}
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={isRemoving} onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            color={transactionCleanup === 'keep' ? 'primary' : 'error'}
            disabled={isRemoving}
            onClick={handleRemove}
          >
            {isRemoving ? 'Removing...' : transactionCleanup === 'keep' ? 'Disconnect' : 'Disconnect and delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
