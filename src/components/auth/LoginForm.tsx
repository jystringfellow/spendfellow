'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { createBrowserSupabaseClient } from '@/lib/supabase';

interface LoginFormProps {
  supabaseConfigured: boolean;
}

export default function LoginForm({ supabaseConfigured }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const supabase = createBrowserSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
      return;
    }

    window.location.href = '/settings';
  }

  async function handleMagicLink() {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const supabase = createBrowserSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false,
      },
    });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
      return;
    }

    setMessage('Check your email for a sign-in link.');
    setIsSubmitting(false);
  }

  return (
    <Paper sx={{ p: 3, maxWidth: 440 }}>
      <Stack spacing={2} component="form" onSubmit={handleSubmit}>
        <Box>
          <Box
            sx={{
              position: 'relative',
              width: 64,
              height: 64,
              mb: 1.5,
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <Image src="/spendfellow-logo.png" alt="Spendfellow" fill sizes="64px" style={{ objectFit: 'cover' }} />
          </Box>
          <Typography variant="h5" component="h1" gutterBottom>
            Sign In
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in with an invited Supabase account to load your household finances.
          </Typography>
        </Box>

        {!supabaseConfigured && (
          <Alert severity="warning">
            Supabase environment variables are not configured. Add them to `.env.local` before signing in.
          </Alert>
        )}

        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}

        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={!supabaseConfigured || isSubmitting}
          required
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={!supabaseConfigured || isSubmitting}
          required
          fullWidth
        />

        <Button
          type="submit"
          variant="contained"
          disabled={!supabaseConfigured || isSubmitting || !email || !password}
        >
          Sign in with password
        </Button>

        <Button
          type="button"
          variant="outlined"
          disabled={!supabaseConfigured || isSubmitting || !email}
          onClick={handleMagicLink}
        >
          Email magic link
        </Button>

        <Typography variant="body2" color="text.secondary" align="center">
          Access is invite-only. Add users from the Supabase dashboard.
        </Typography>
      </Stack>
    </Paper>
  );
}
