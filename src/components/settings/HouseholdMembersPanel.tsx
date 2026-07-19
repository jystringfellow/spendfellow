'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Household, HouseholdInvitation, HouseholdMember } from '@/types/database';

interface HouseholdSummary extends Household {
  role: HouseholdMember['role'];
}

interface MemberSummary extends HouseholdMember {
  email: string;
  full_name: string | null;
}

interface IncomingInvitation extends HouseholdInvitation {
  household_name: string;
}

interface HouseholdAccessData {
  household: HouseholdSummary | null;
  members: MemberSummary[];
  invitations: HouseholdInvitation[];
  incomingInvitations: IncomingInvitation[];
  error?: string;
}

interface InviteResponse {
  message?: string;
  error?: string;
}

function invitationExpiryLabel(expiresAt: string) {
  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime()) ? '' : `Expires ${date.toLocaleDateString()}`;
}

export default function HouseholdMembersPanel() {
  const [data, setData] = useState<HouseholdAccessData | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadHouseholdAccess = useCallback(async () => {
    const response = await fetch('/api/household-invitations', { cache: 'no-store' });
    const result = (await response.json()) as HouseholdAccessData;
    if (!response.ok) {
      setError(result.error ?? 'Unable to load household access.');
      return;
    }
    setData(result);
  }, []);

  useEffect(() => {
    void loadHouseholdAccess();
  }, [loadHouseholdAccess]);

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const response = await fetch('/api/household-invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const result = (await response.json()) as InviteResponse;
    setIsSubmitting(false);

    if (!response.ok) {
      setError(result.error ?? 'Unable to create the invitation.');
      await loadHouseholdAccess();
      return;
    }

    setMessage(result.message ?? 'Invitation created.');
    setEmail('');
    await loadHouseholdAccess();
  }

  async function revokeInvitation(invitationId: string) {
    setError(null);
    setMessage(null);
    setRevokingId(invitationId);

    const response = await fetch(`/api/household-invitations/${encodeURIComponent(invitationId)}`, {
      method: 'DELETE',
    });
    const result = (await response.json()) as InviteResponse;
    setRevokingId(null);

    if (!response.ok) {
      setError(result.error ?? 'Unable to revoke the invitation.');
      return;
    }

    setMessage('Invitation revoked.');
    await loadHouseholdAccess();
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6" component="h2">
            Household Access
          </Typography>
          <Typography color="text.secondary">
            Invite trusted people to share this household’s accounts, budgets, and transactions.
          </Typography>
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}
        {message ? <Alert severity="success">{message}</Alert> : null}

        {!data ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={20} />
            <Typography color="text.secondary">Loading household members…</Typography>
          </Box>
        ) : (
          <>
            {data.incomingInvitations.map((invitation) => (
              <Alert
                key={invitation.id}
                severity="info"
                action={
                  <Button
                    component={Link}
                    href={`/auth/set-password?invitation=${encodeURIComponent(invitation.id)}`}
                    color="inherit"
                    size="small"
                  >
                    Review
                  </Button>
                }
              >
                You are invited to join {invitation.household_name}.
              </Alert>
            ))}

            {data.household ? (
              <>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {data.household.name}
                  </Typography>
                  <Chip size="small" label={data.household.role} />
                </Stack>

                <Stack divider={<Divider flexItem />}>
                  {data.members.map((member) => (
                    <Box
                      key={member.user_id}
                      sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, py: 1.25 }}
                    >
                      <Box>
                        <Typography>{member.full_name || member.email}</Typography>
                        {member.full_name ? (
                          <Typography variant="body2" color="text.secondary">
                            {member.email}
                          </Typography>
                        ) : null}
                      </Box>
                      <Chip size="small" variant="outlined" label={member.role} />
                    </Box>
                  ))}
                </Stack>

                {data.household.role === 'owner' ? (
                  <>
                    <Divider />
                    <Box component="form" onSubmit={inviteMember}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-start' }}>
                        <TextField
                          label="Member email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          disabled={isSubmitting}
                          size="small"
                          required
                          fullWidth
                        />
                        <Button
                          type="submit"
                          variant="contained"
                          disabled={isSubmitting || !email}
                          sx={{ whiteSpace: 'nowrap' }}
                        >
                          {isSubmitting ? 'Inviting…' : 'Invite member'}
                        </Button>
                      </Stack>
                    </Box>

                    {data.invitations.length > 0 ? (
                      <Stack spacing={1}>
                        <Typography variant="subtitle2">Pending invitations</Typography>
                        {data.invitations.map((invitation) => (
                          <Box
                            key={invitation.id}
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 2,
                              py: 0.5,
                            }}
                          >
                            <Box>
                              <Typography>{invitation.email}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {invitationExpiryLabel(invitation.expires_at)}
                              </Typography>
                            </Box>
                            <Button
                              color="error"
                              size="small"
                              disabled={revokingId === invitation.id}
                              onClick={() => void revokeInvitation(invitation.id)}
                            >
                              {revokingId === invitation.id ? 'Revoking…' : 'Revoke'}
                            </Button>
                          </Box>
                        ))}
                      </Stack>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : data.incomingInvitations.length === 0 ? (
              <Alert severity="info">You do not belong to a household yet. Ask a household owner to invite this email.</Alert>
            ) : null}
          </>
        )}
      </Stack>
    </Paper>
  );
}
