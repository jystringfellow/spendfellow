import { Container, Typography, Paper, Box } from '@mui/material';

export default function AccountsPage() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Accounts
        </Typography>
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="body1" color="text.secondary">
            Account management coming soon. Here you will be able to:
          </Typography>
          <Box component="ul" sx={{ mt: 2 }}>
            <li>Connect bank accounts via Plaid</li>
            <li>View account balances</li>
            <li>Manage linked accounts</li>
            <li>Sync transactions automatically</li>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
