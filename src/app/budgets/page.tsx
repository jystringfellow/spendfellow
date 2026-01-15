import { Container, Typography, Paper, Box } from '@mui/material';

export default function BudgetsPage() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Budgets
        </Typography>
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="body1" color="text.secondary">
            Budget management coming soon. Here you will be able to:
          </Typography>
          <Box component="ul" sx={{ mt: 2 }}>
            <li>Create monthly budgets by category</li>
            <li>View budget vs actual spending</li>
            <li>Track over/under budget amounts</li>
            <li>Manage budget categories</li>
            <li>Set budget alerts</li>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
