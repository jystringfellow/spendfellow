'use client';

import { AppBar, Toolbar, Typography, Button, Container, Box } from '@mui/material';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home as HomeIcon,
  AccountBalance as AccountBalanceIcon,
  Receipt as ReceiptIcon,
  Category as CategoryIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';

const navItems = [
  { label: 'Home', path: '/', icon: HomeIcon },
  { label: 'Accounts', path: '/accounts', icon: AccountBalanceIcon },
  { label: 'Transactions', path: '/transactions', icon: ReceiptIcon },
  { label: 'Budgets', path: '/budgets', icon: CategoryIcon },
  { label: 'Reports', path: '/reports', icon: AssessmentIcon },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <AppBar position="static">
      <Container maxWidth="lg">
        <Toolbar disableGutters>
          <Typography
            variant="h6"
            component={Link}
            href="/"
            sx={{
              mr: 4,
              fontWeight: 700,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            SpendFellow
          </Typography>

          <Box sx={{ flexGrow: 1, display: 'flex', gap: 1 }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path;
              
              return (
                <Button
                  key={item.path}
                  component={Link}
                  href={item.path}
                  startIcon={<Icon />}
                  sx={{
                    color: 'white',
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    },
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
