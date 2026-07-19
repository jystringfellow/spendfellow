'use client';

import { FormEvent, useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { createBrowserSupabaseClient } from '@/lib/supabase';

interface SetPasswordFormProps {
  invitationId: string;
  householdName: string;
  email: string;
}

interface AcceptInvitationResponse {
  error?: string;
}

export default function SetPasswordForm({ invitationId, householdName, email }: SetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }

    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const supabase = createBrowserSupabaseClient();
    const { error: passwordError } = await supabase.auth.updateUser({ password });

    if (passwordError) {
      setError(passwordError.message);
      setIsSubmitting(false);
      return;
    }

    const response = await fetch('/api/household-invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitationId }),
    });
    const result = (await response.json()) as AcceptInvitationResponse;

    if (!response.ok) {
      setError(result.error ?? 'Unable to join the household.');
      setIsSubmitting(false);
      return;
    }

    window.location.href = '/settings';
  }

  return (
    <Stack spacing={2} component="form" onSubmit={handleSubmit}>
      <div>
        <Typography variant="h5" component="h1" gutterBottom>
          Join {householdName}
        </Typography>
        <Typography color="text.secondary">
          Your email {email} is verified. Choose a password to finish joining the household.
        </Typography>
      </div>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        helperText="Use at least 8 characters."
        disabled={isSubmitting}
        required
        fullWidth
      />
      <TextField
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={isSubmitting}
        required
        fullWidth
      />
      <Button type="submit" variant="contained" disabled={isSubmitting || !password || !confirmation}>
        {isSubmitting ? 'Joining household...' : 'Set password and join'}
      </Button>
    </Stack>
  );
}
