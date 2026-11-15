import { Box, Container } from '@mui/material';
import LoginForm from '@/components/auth/LoginForm';
import { hasSupabaseEnv } from '@/lib/supabaseEnv';

interface LoginPageProps {
  searchParams?: Promise<{
    error?: string;
  }>;
}

export default async function LoginPage({ searchParams: searchParamsPromise }: LoginPageProps) {
  const searchParams = await searchParamsPromise;
  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 6, display: 'flex', justifyContent: 'center' }}>
        <LoginForm supabaseConfigured={hasSupabaseEnv()} initialError={searchParams?.error} />
      </Box>
    </Container>
  );
}
