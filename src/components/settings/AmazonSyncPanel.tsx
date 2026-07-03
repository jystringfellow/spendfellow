'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ExtensionIcon from '@mui/icons-material/Extension';

interface AmazonSyncTokenResponse {
  amazon_url?: string;
  expires_at?: string;
  error?: string;
}

function getDefaultCutoffDate() {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return date.toISOString().slice(0, 10);
}

function isAllowedAppOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

function isLoopbackOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export default function AmazonSyncPanel() {
  const [cutoffDate, setCutoffDate] = useState(getDefaultCutoffDate);
  const [isStarting, setIsStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appOrigin, setAppOrigin] = useState('');
  const [isAllowedOrigin, setIsAllowedOrigin] = useState(true);
  const [isLocalOrigin, setIsLocalOrigin] = useState(false);
  const [forceReindex, setForceReindex] = useState(false);

  useEffect(() => {
    const origin = window.location.origin;
    setAppOrigin(origin);
    setIsAllowedOrigin(isAllowedAppOrigin(origin));
    setIsLocalOrigin(isLoopbackOrigin(origin));
  }, []);

  async function startSync() {
    if (isStarting) {
      return;
    }

    setIsStarting(true);
    setMessage(null);
    setError(null);

    const response = await fetch('/api/amazon-sync/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cutoffDate,
        appOrigin,
        forceReindex,
      }),
    });
    const data = (await response.json()) as AmazonSyncTokenResponse;
    setIsStarting(false);

    if (!response.ok || !data.amazon_url) {
      setError(data.error ?? 'Unable to start Amazon sync.');
      return;
    }

    setMessage(`Opened Amazon sync. Token expires at ${new Date(data.expires_at ?? '').toLocaleTimeString()}.`);
    window.open(data.amazon_url, '_blank', 'noopener,noreferrer');
  }

  function openPreview() {
    const amazonUrl = new URL('https://www.amazon.com/cpe/yourpayments/transactions');
    amazonUrl.searchParams.set('budgetSyncPreview', '1');
    amazonUrl.searchParams.set('budgetAppOrigin', appOrigin);
    if (cutoffDate) {
      amazonUrl.searchParams.set('budgetCutoffDate', cutoffDate);
    }
    if (forceReindex) {
      amazonUrl.searchParams.set('budgetForceReindex', '1');
    }
    window.open(amazonUrl.toString(), '_blank', 'noopener,noreferrer');
  }

  return (
    <Stack spacing={2} alignItems="flex-start">
      <Typography variant="h6">Amazon Purchase Sync</Typography>
      <Typography color="text.secondary">
        Import Amazon purchase metadata through a user-installed Tampermonkey script. The app creates a short-lived token,
        then Amazon pages that you manually open send scraped transactions and order details back to this deployment.
      </Typography>
      {isLocalOrigin ? (
        <Alert severity="info">
          Local testing is enabled for loopback origins. The userscript may post from Amazon to {appOrigin}; deployed
          installs still require HTTPS.
        </Alert>
      ) : null}
      {!isAllowedOrigin ? (
        <Alert severity="warning">
          The userscript only sends data to HTTPS app origins or local loopback development origins.
        </Alert>
      ) : null}
      <TextField
        label="Stop at transactions before"
        type="date"
        value={cutoffDate}
        onChange={(event) => setCutoffDate(event.target.value)}
        InputLabelProps={{ shrink: true }}
        helperText="The userscript stops scanning once it reaches this transaction date."
        sx={{ width: { xs: '100%', sm: 280 } }}
      />
      <FormControlLabel
        control={
          <Checkbox checked={forceReindex} onChange={(event) => setForceReindex(event.target.checked)} />
        }
        label="Force re-index transactions and order details"
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button
          variant="contained"
          startIcon={isStarting ? <CircularProgress color="inherit" size={18} /> : <OpenInNewIcon />}
          disabled={isStarting || !isAllowedOrigin}
          onClick={() => void startSync()}
        >
          {isStarting ? 'Starting...' : 'Sync Amazon Purchases'}
        </Button>
        <Button variant="outlined" startIcon={<VisibilityIcon />} disabled={!isAllowedOrigin} onClick={openPreview}>
          Preview Payload Only
        </Button>
        <Button
          component="a"
          href="/amazon-sync.user.js?v=0.1.20"
          target="_blank"
          rel="noreferrer"
          startIcon={<ExtensionIcon />}
        >
          Install Userscript
        </Button>
      </Stack>
      {message ? <Alert severity="success">{message}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
    </Stack>
  );
}
