import { Box, Container, Typography, Paper, Grid, Button } from '@mui/material';
import Link from 'next/link';
import {
  AccountBalance as AccountBalanceIcon,
  Category as CategoryIcon,
  Receipt as ReceiptIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';

export default function Home() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h2" component="h1" gutterBottom align="center">
          SpendFellow
        </Typography>
        <Typography variant="h5" component="h2" gutterBottom align="center" color="text.secondary">
          Personal Finance Tracking Made Simple
        </Typography>

        <Box sx={{ mt: 6, mb: 4 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <AccountBalanceIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                  <Typography variant="h5">Accounts</Typography>
                </Box>
                <Typography variant="body1" color="text.secondary" paragraph>
                  Connect your bank accounts via Plaid for automatic transaction syncing.
                  Track balances across all your accounts in one place.
                </Typography>
                <Button variant="contained" component={Link} href="/accounts">
                  Manage Accounts
                </Button>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <ReceiptIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                  <Typography variant="h5">Transactions</Typography>
                </Box>
                <Typography variant="body1" color="text.secondary" paragraph>
                  View and categorize all your transactions. Add tags and notes for
                  better organization and tracking.
                </Typography>
                <Button variant="contained" component={Link} href="/transactions">
                  View Transactions
                </Button>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <CategoryIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                  <Typography variant="h5">Budgets</Typography>
                </Box>
                <Typography variant="body1" color="text.secondary" paragraph>
                  Set monthly budgets by category and track your spending against them.
                  See exactly where your money goes each month.
                </Typography>
                <Button variant="contained" component={Link} href="/budgets">
                  Manage Budgets
                </Button>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <AssessmentIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                  <Typography variant="h5">Reports</Typography>
                </Box>
                <Typography variant="body1" color="text.secondary" paragraph>
                  Yearly rollups with budget comparisons. See your financial trends
                  and identify areas for improvement.
                </Typography>
                <Button variant="contained" component={Link} href="/reports">
                  View Reports
                </Button>
              </Paper>
            </Grid>
          </Grid>
        </Box>

        <Paper sx={{ p: 3, mt: 4, bgcolor: 'primary.main', color: 'white' }}>
          <Typography variant="h6" gutterBottom>
            Key Features
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2">✓ Plaid Integration</Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2">✓ Monthly Budgets</Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2">✓ Transaction Tags</Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2">✓ Yearly Reports</Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2">✓ Secure & Private</Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2">✓ Self-Hosted</Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2">✓ Spreadsheet-Style Views</Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2">✓ Low Cost</Typography>
            </Grid>
          </Grid>
        </Paper>
      </Box>
    </Container>
  );
}
