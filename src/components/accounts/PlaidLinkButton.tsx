'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, CircularProgress, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { PlaidLinkError, PlaidLinkOnEventMetadata, PlaidLinkOnExitMetadata, usePlaidLink } from 'react-plaid-link';

const PLAID_LINK_TOKEN_STORAGE_KEY = 'spendfellow:plaid-link-token';
const PLAID_LINK_ENVIRONMENT_STORAGE_KEY = 'spendfellow:plaid-link-environment';
type PlaidEnvironment = 'sandbox' | 'development' | 'production';

interface PlaidLinkButtonProps {
  defaultEnvironment: PlaidEnvironment;
}

interface PlaidLinkSessionProps {
  receivedRedirectUri?: string;
  token: string;
  onClosed: () => void;
  onError: (message: string | null) => void;
  onOpened: () => void;
  onSuccess: (
    publicToken: string,
    metadata: { institution?: { institution_id?: string; name?: string } | null }
  ) => void;
}

function formatPlaidExitError(error: PlaidLinkError | null, metadata: PlaidLinkOnExitMetadata): string | null {
  if (!error) {
    return null;
  }

  const details = [
    error.error_code ? `code: ${error.error_code}` : null,
    error.error_type ? `type: ${error.error_type}` : null,
    metadata.request_id ? `request: ${metadata.request_id}` : null,
    metadata.link_session_id ? `session: ${metadata.link_session_id}` : null,
  ].filter(Boolean);

  return `Plaid Link failed: ${error.error_message ?? 'Unknown error'}${details.length ? ` (${details.join(', ')})` : ''}`;
}

function formatPlaidEventError(metadata: PlaidLinkOnEventMetadata): string | null {
  if (!metadata.error_code && !metadata.error_message) {
    return null;
  }

  const details = [
    metadata.error_code ? `code: ${metadata.error_code}` : null,
    metadata.error_type ? `type: ${metadata.error_type}` : null,
    metadata.institution_name ? `institution: ${metadata.institution_name}` : null,
    metadata.request_id ? `request: ${metadata.request_id}` : null,
    metadata.link_session_id ? `session: ${metadata.link_session_id}` : null,
  ].filter(Boolean);

  return `Plaid Link error: ${metadata.error_message ?? 'Unknown error'}${
    details.length ? ` (${details.join(', ')})` : ''
  }`;
}

function restorePageScroll() {
  document.documentElement.style.overflow = '';
  document.documentElement.style.position = '';
  document.documentElement.style.width = '';
  document.documentElement.style.top = '';
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.width = '';
  document.body.style.top = '';
  document.body.style.paddingRight = '';
}

function PlaidLinkSession({
  receivedRedirectUri,
  token,
  onClosed,
  onError,
  onOpened,
  onSuccess,
}: PlaidLinkSessionProps) {
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledCloseRef = useRef(false);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const closeSession = useCallback(() => {
    if (handledCloseRef.current) {
      return;
    }

    handledCloseRef.current = true;
    clearStallTimer();
    restorePageScroll();
    window.setTimeout(restorePageScroll, 0);
    window.setTimeout(restorePageScroll, 250);
    onClosed();
  }, [clearStallTimer, onClosed]);

  const { open, ready, exit } = usePlaidLink({
    token,
    onSuccess: (publicToken, metadata) => {
      closeSession();
      onSuccess(publicToken, metadata);
    },
    onExit: (plaidError: PlaidLinkError | null, metadata: PlaidLinkOnExitMetadata) => {
      closeSession();
      const formattedError = formatPlaidExitError(plaidError, metadata);
      if (formattedError) {
        console.error('Plaid Link exit error', { plaidError, metadata });
        onError(formattedError);
      }
    },
    onEvent: (eventName: string, metadata: PlaidLinkOnEventMetadata) => {
      if (eventName !== 'ERROR') {
        return;
      }

      console.error('Plaid Link event error', metadata);
      onError(formatPlaidEventError(metadata));
      closeSession();
      exit(true);
    },
    receivedRedirectUri,
  });

  useEffect(() => {
    if (!ready) {
      return;
    }

    onOpened();
    open();
    clearStallTimer();
    stallTimerRef.current = setTimeout(() => {
      onError('Plaid Link did not continue after 45 seconds. Try a different institution or retry this one later.');
      closeSession();
      exit(true);
    }, 45_000);

    return clearStallTimer;
  }, [clearStallTimer, closeSession, exit, onError, onOpened, open, ready]);

  useEffect(() => clearStallTimer, [clearStallTimer]);

  useEffect(() => {
    return () => {
      clearStallTimer();
      restorePageScroll();
      window.setTimeout(restorePageScroll, 0);
      window.setTimeout(restorePageScroll, 250);
    };
  }, [clearStallTimer]);

  return null;
}

export default function PlaidLinkButton({ defaultEnvironment }: PlaidLinkButtonProps) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string | undefined>(undefined);
  const [selectedEnvironment, setSelectedEnvironment] = useState<PlaidEnvironment>(defaultEnvironment);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearStoredLinkSession = useCallback(() => {
    window.localStorage.removeItem(PLAID_LINK_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(PLAID_LINK_ENVIRONMENT_STORAGE_KEY);
  }, []);

  const closeLinkSession = useCallback(() => {
    setIsLinkOpen(false);
    setLinkToken(null);
    clearStoredLinkSession();
  }, [clearStoredLinkSession]);

  const loadLinkToken = useCallback(async (environment: PlaidEnvironment) => {
    setIsLoadingToken(true);
    setError(null);

    const response = await fetch('/api/plaid/link-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment }),
    });
    const data = (await response.json()) as { link_token?: string; environment?: PlaidEnvironment; error?: string };

    if (!response.ok || !data.link_token) {
      setError(data.error ?? 'Unable to create a Plaid Link session.');
      setLinkToken(null);
      clearStoredLinkSession();
      setIsLoadingToken(false);
      return;
    }

    setLinkToken(data.link_token);
    const resolvedEnvironment = data.environment ?? environment;
    setSelectedEnvironment(resolvedEnvironment);
    window.localStorage.setItem(PLAID_LINK_TOKEN_STORAGE_KEY, data.link_token);
    window.localStorage.setItem(PLAID_LINK_ENVIRONMENT_STORAGE_KEY, resolvedEnvironment);
    setReceivedRedirectUri(undefined);
    setIsLoadingToken(false);
  }, [clearStoredLinkSession]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isPlaidRedirect = params.has('oauth_state_id') || params.has('link_token');

    if (!isPlaidRedirect) {
      return;
    }

    const storedLinkToken = window.localStorage.getItem(PLAID_LINK_TOKEN_STORAGE_KEY);
    const storedEnvironment = window.localStorage.getItem(PLAID_LINK_ENVIRONMENT_STORAGE_KEY) as PlaidEnvironment | null;
    if (!storedLinkToken) {
      setError('Plaid returned from OAuth, but the original Link token was not found. Start the connection again.');
      return;
    }

    if (storedEnvironment === 'sandbox' || storedEnvironment === 'development' || storedEnvironment === 'production') {
      setSelectedEnvironment(storedEnvironment);
    }

    setLinkToken(storedLinkToken);
    setReceivedRedirectUri(window.location.href);
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { institution_id?: string; name?: string } | null }) => {
      setIsSaving(true);
      setError(null);

      const response = await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_token: publicToken,
          environment: selectedEnvironment,
          institution: metadata.institution ?? null,
        }),
      });
      const data = (await response.json()) as { error?: string };

      setIsSaving(false);

      if (!response.ok) {
        setError(data.error ?? 'Unable to save connected accounts.');
        return;
      }

      router.refresh();
    },
    [router, selectedEnvironment]
  );

  const handleConnect = () => {
    closeLinkSession();
    setLinkToken(null);
    void loadLinkToken(selectedEnvironment);
  };

  const isBusy = isLoadingToken || isSaving || isLinkOpen;

  return (
    <Stack spacing={1.5} alignItems="flex-start">
      {linkToken ? (
        <PlaidLinkSession
          key={linkToken}
          receivedRedirectUri={receivedRedirectUri}
          token={linkToken}
          onClosed={closeLinkSession}
          onError={setError}
          onOpened={() => setIsLinkOpen(true)}
          onSuccess={onSuccess}
        />
      ) : null}
      <ToggleButtonGroup
        exclusive
        size="small"
        value={selectedEnvironment}
        disabled={isBusy}
        onChange={(_, nextEnvironment: PlaidEnvironment | null) => {
          if (nextEnvironment) {
            setSelectedEnvironment(nextEnvironment);
          }
        }}
        aria-label="Plaid environment"
      >
        <ToggleButton value="sandbox">Sandbox</ToggleButton>
        <ToggleButton value="production">Production</ToggleButton>
      </ToggleButtonGroup>
      <Button
        variant="contained"
        startIcon={isLoadingToken || isSaving ? <CircularProgress color="inherit" size={18} /> : <AddIcon />}
        disabled={isBusy}
        onClick={handleConnect}
      >
        {isLinkOpen ? 'Connecting...' : `Connect ${selectedEnvironment} account`}
      </Button>
      {error ? <Alert severity="error">{error}</Alert> : null}
    </Stack>
  );
}
