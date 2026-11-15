import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import Link from '@/components/common/Link';
import {
  AccountBalanceOutlined as AccountBalanceIcon,
  ArrowForward as ArrowForwardIcon,
  CategoryOutlined as CategoryIcon,
  ReceiptLongOutlined as ReceiptIcon,
} from '@mui/icons-material';

const workflows = [
  {
    title: 'Review your budget',
    description: 'See where this month stands, compare spending, and plan what comes next.',
    href: '/budgets', label: 'Open budgets', icon: CategoryIcon, color: 'secondary.main',
  },
  {
    title: 'Keep accounts in view',
    description: 'Check your balances, manage linked institutions, and keep everything connected.',
    href: '/accounts', label: 'View accounts', icon: AccountBalanceIcon, color: 'primary.main',
  },
];

export default function Home() {
  return (
    <Container maxWidth="lg">
      <Stack spacing={{ xs: 3, md: 4 }} sx={{ py: { xs: 2, md: 5 } }}>
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.14em' }}>
            YOUR HOUSEHOLD FINANCES
          </Typography>
          <Typography component="h1" variant="h4" sx={{ mt: 1, mb: 1.5, fontSize: { xs: '2rem', md: '2.75rem' } }}>
            A little clarity. A lot of possibility.
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 560, lineHeight: 1.8 }}>
            Make room for what matters. Keep your spending organized and your household moving toward its goals.
          </Typography>
        </Box>

        <Paper component="section" aria-labelledby="categorize-heading" sx={{ p: { xs: 3, md: 4 }, position: 'relative', overflow: 'hidden' }}>
          <Box aria-hidden="true" sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: 'linear-gradient(90deg, #6DFF2E, #8B3DFF)' }} />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ xs: 'flex-start', md: 'center' }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="overline" color="primary.main" sx={{ fontWeight: 700, letterSpacing: '0.1em' }}>
                PICK UP WHERE YOU LEFT OFF
              </Typography>
              <Typography id="categorize-heading" component="h2" variant="h5" sx={{ mt: 0.5, mb: 1 }}>
                Give every transaction a place.
              </Typography>
              <Typography color="text.secondary" sx={{ maxWidth: 540, lineHeight: 1.75 }}>
                Review uncategorized spending to keep your budget useful and your next decision a little easier.
              </Typography>
            </Box>
            <Button variant="contained" component={Link} href="/transactions?categoryId=uncategorized"
              startIcon={<ReceiptIcon />} endIcon={<ArrowForwardIcon />} sx={{ flexShrink: 0 }}>
              Categorize transactions
            </Button>
          </Stack>
        </Paper>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
          {workflows.map(({ title, description, href, label, icon: Icon, color }) => (
            <Paper key={href} component="section" sx={{ p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <Icon sx={{ color, mb: 2.5, fontSize: 28 }} />
              <Typography component="h2" variant="h6" gutterBottom>{title}</Typography>
              <Typography color="text.secondary" sx={{ lineHeight: 1.75, mb: 3, flex: 1 }}>{description}</Typography>
              <Button component={Link} href={href} color={color === 'secondary.main' ? 'secondary' : 'primary'}
                endIcon={<ArrowForwardIcon />} sx={{ ml: -1 }}>{label}</Button>
            </Paper>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary">
          Your numbers, your way. Built around the way your household budgets.
        </Typography>
      </Stack>
    </Container>
  );
}
