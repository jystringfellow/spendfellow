import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Box, Button, Container, Divider, Paper, Stack, Typography } from '@mui/material';
import AmazonSyncPanel from '@/components/settings/AmazonSyncPanel';
import { getCurrentHousehold } from '@/lib/households';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getCurrentHousehold(supabase);

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              Settings
            </Typography>
            <Typography color="text.secondary">Manage app configuration and private import helpers.</Typography>
          </Box>

          {!household ? (
            <Paper sx={{ p: 3 }}>
              <Typography color="text.secondary">
                Create a household before connecting private import sources.
              </Typography>
            </Paper>
          ) : (
            <Paper sx={{ p: 3 }}>
              <AmazonSyncPanel />
            </Paper>
          )}

          <Paper sx={{ p: 3 }}>
            <Stack spacing={2} alignItems="flex-start">
              <Typography variant="h6">Budget Constants</Typography>
              <Typography color="text.secondary">
                Categories, tags, recurring values, and budget constants live on the constants screen.
              </Typography>
              <Button component={Link} href="/constants" variant="outlined">
                Open constants
              </Button>
            </Stack>
          </Paper>

          <Divider />
        </Stack>
      </Box>
    </Container>
  );
}
