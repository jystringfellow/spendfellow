import Link from '@/components/common/Link';
import { redirect } from 'next/navigation';
import { Box, Button, Chip, Container, Paper, Stack, Typography } from '@mui/material';
import { BudgetSettingsContent } from '@/components/settings/BudgetSettingsContent';
import AmazonSyncPanel from '@/components/settings/AmazonSyncPanel';
import GoogleSheetsBudgetImportPanel from '@/components/settings/GoogleSheetsBudgetImportPanel';
import HouseholdMembersPanel from '@/components/settings/HouseholdMembersPanel';
import { getCurrentHousehold } from '@/lib/households';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

interface SettingsPageProps {
  searchParams?: Promise<{
    year?: string;
    month?: string;
    section?: string;
  }>;
}

export default async function SettingsPage({ searchParams: searchParamsPromise }: SettingsPageProps) {
  const searchParams = await searchParamsPromise;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getCurrentHousehold(supabase);

  const sections = [
    { id: 'budget', label: 'Budget', description: 'Set category budgets and choose how balances appear in your plan.' },
    { id: 'recurring', label: 'Recurring', description: 'Plan regular bills and the formulas that connect them.' },
    { id: 'tags', label: 'Tags', description: 'Organize transactions with labels that work across categories.' },
    { id: 'household', label: 'Household', description: 'Manage the people who share your budget.' },
    { id: 'imports', label: 'Imports', description: 'Bring in budget plans and purchase details from other sources.' },
  ];
  const selected = sections.find((section) => section.id === searchParams?.section) ?? sections[0];
  function sectionHref(section: string) {
    const params = new URLSearchParams({ section });
    if (searchParams?.year) params.set('year', searchParams.year);
    if (searchParams?.month) params.set('month', searchParams.month);
    return `/settings?${params.toString()}`;
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>Settings</Typography>
            <Typography color="text.secondary">Make Spendfellow fit the way you plan and spend.</Typography>
            {household ? <Chip size="small" variant="outlined" label={household.name} sx={{ mt: 1.5 }} /> : null}
          </Box>
          <Paper component="nav" aria-label="Settings sections" sx={{ p: 0.75 }}>
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {sections.map((section) => (
                <Button key={section.id} component={Link} href={sectionHref(section.id)}
                  aria-current={selected.id === section.id ? 'page' : undefined}
                  variant={selected.id === section.id ? 'outlined' : 'text'}
                  sx={selected.id === section.id ? { bgcolor: 'action.selected' } : undefined}
                  color={selected.id === section.id ? 'secondary' : 'inherit'}>
                  {section.label}
                </Button>
              ))}
            </Stack>
          </Paper>
          <Box>
            <Typography variant="h5" component="h2" gutterBottom>{selected.label}</Typography>
            <Typography color="text.secondary">{selected.description}</Typography>
          </Box>
          {selected.id === 'household' ? <HouseholdMembersPanel /> : selected.id === 'imports' ? (
            <Paper sx={{ p: { xs: 2, sm: 3 } }}>
              {!household ? <Typography color="text.secondary">Create a household before connecting import sources.</Typography> : (
                <Stack spacing={3}><GoogleSheetsBudgetImportPanel /><AmazonSyncPanel /></Stack>
              )}
            </Paper>
          ) : (
            <BudgetSettingsContent embedded searchParams={searchParams} section={selected.id as 'budget' | 'recurring' | 'tags'} />
          )}
        </Stack>
      </Box>
    </Container>
  );
}
