import { Box, Container } from '@mui/material';
import LoginForm from '@/components/auth/LoginForm';
import { hasSupabaseEnv } from '@/lib/supabaseEnv';

export default function LoginPage() {
  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 6, display: 'flex', justifyContent: 'center' }}>
        <LoginForm supabaseConfigured={hasSupabaseEnv()} />
      </Box>
    </Container>
  );
}

