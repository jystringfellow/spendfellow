import Image from 'next/image';
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import {
  AccountBalance as AccountBalanceIcon,
  Category as CategoryIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';

export default function Home() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Box
          sx={{
            mx: 'auto',
            mb: 4,
            position: 'relative',
            width: 'min(960px, 100%)',
            aspectRatio: '3 / 1',
          }}
        >
          <Image
            src="/spendfellow-lockup.png"
            alt="Spendfellow"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 960px"
            style={{ objectFit: 'contain' }}
          />
        </Box>
        <Typography variant="h5" component="h1" gutterBottom align="center" color="text.secondary">
          Spreadsheet-first finance tracking for household budgeting.
        </Typography>

        <Paper
          sx={{
            p: 3,
            mt: 6,
            mx: 'auto',
            maxWidth: 860,
            bgcolor: 'background.paper',
            color: 'text.primary',
            borderColor: 'primary.main',
          }}
        >
          <Typography variant="h6" component="h2" gutterBottom align="center">
            Pick up where you left off
          </Typography>
          <Typography color="text.secondary" align="center" sx={{ mb: 2.5 }}>
            Continue with the household workflow you use most.
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="center">
            <Button
              variant="contained"
              component={Link}
              href="/transactions?categoryId=uncategorized"
              startIcon={<ReceiptIcon />}
            >
              Categorize transactions
            </Button>
            <Button variant="outlined" component={Link} href="/budgets" startIcon={<CategoryIcon />}>
              Review this month
            </Button>
            <Button variant="outlined" component={Link} href="/accounts" startIcon={<AccountBalanceIcon />}>
              Manage accounts
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Container>
  );
}
