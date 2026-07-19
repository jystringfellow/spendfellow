import { Box, Container } from '@mui/material';
import LoginForm from '@/components/auth/LoginForm';
import { hasSupabaseEnv } from '@/lib/supabaseEnv';

interface LoginPageProps {
  searchParams?: {
    error?: string;
  };
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 6, display: 'flex', justifyContent: 'center' }}>
        <LoginForm supabaseConfigured={hasSupabaseEnv()} initialError={searchParams?.error} />
      </Box>
    </Container>
  );
}
