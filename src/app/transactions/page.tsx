import { Container, Typography, Paper, Box } from '@mui/material';

export default function TransactionsPage() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Transactions
        </Typography>
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="body1" color="text.secondary">
            Transaction management coming soon. Here you will be able to:
          </Typography>
          <Box component="ul" sx={{ mt: 2 }}>
            <li>View all transactions in a spreadsheet-style table</li>
            <li>Filter and search transactions</li>
            <li>Categorize transactions</li>
            <li>Add tags and notes</li>
            <li>Edit transaction details</li>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
