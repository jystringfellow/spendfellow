import { Box, Container, Paper } from '@mui/material';
import { redirect } from 'next/navigation';
import SetPasswordForm from '@/components/auth/SetPasswordForm';
import { findPendingHouseholdInvitation } from '@/lib/householdInvitations';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

interface SetPasswordPageProps {
  searchParams?: {
    invitation?: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function SetPasswordPage({ searchParams }: SetPasswordPageProps) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    const loginParams = new URLSearchParams();
    loginParams.set('error', 'Open your invitation link or request a magic link before joining a household.');
    redirect(`/login?${loginParams.toString()}`);
  }

  const invitation = await findPendingHouseholdInvitation(user.email, searchParams?.invitation);
  if (!invitation) {
    redirect('/settings');
  }

  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 6 }}>
        <Paper sx={{ p: 3 }}>
          <SetPasswordForm
            invitationId={invitation.id}
            householdName={invitation.household_name}
            email={user.email}
          />
        </Paper>
      </Box>
    </Container>
  );
}
