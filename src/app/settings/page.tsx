import { redirect } from 'next/navigation';
import { Box, Container, Paper, Stack, Typography } from '@mui/material';
import { BudgetSettingsContent } from '@/components/settings/BudgetSettingsContent';
import AmazonSyncPanel from '@/components/settings/AmazonSyncPanel';
import GoogleSheetsBudgetImportPanel from '@/components/settings/GoogleSheetsBudgetImportPanel';
import HouseholdMembersPanel from '@/components/settings/HouseholdMembersPanel';
import { getCurrentHousehold } from '@/lib/households';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

interface SettingsPageProps {
  searchParams?: {
    year?: string;
    month?: string;
  };
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
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
        <BudgetSettingsContent
          embedded
          searchParams={searchParams}
          trailingContent={
            <Stack spacing={3}>
              <HouseholdMembersPanel />
              <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="h6">Import Tools</Typography>
                    <Typography color="text.secondary">
                      Optional helpers for importing transactions from external sources.
                    </Typography>
                  </Box>
                  {!household ? (
                    <Typography color="text.secondary">
                      Create a household before connecting private import sources.
                    </Typography>
                  ) : (
                    <>
                      <GoogleSheetsBudgetImportPanel />
                      <AmazonSyncPanel />
                    </>
                  )}
                </Stack>
              </Paper>
            </Stack>
          }
        />
      </Box>
    </Container>
  );
}
