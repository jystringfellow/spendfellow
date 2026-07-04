import { Container, Typography, Paper, Box } from '@mui/material';

export default function ReportsPage() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Reports
        </Typography>
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="body1" color="text.secondary">
            Reporting features coming soon. Here you will be able to:
          </Typography>
          <Box component="ul" sx={{ mt: 2 }}>
            <li>View yearly spending rollups</li>
            <li>Compare budget vs actual by month</li>
            <li>Analyze spending trends</li>
            <li>Generate custom reports</li>
            <li>Export data for further analysis</li>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
