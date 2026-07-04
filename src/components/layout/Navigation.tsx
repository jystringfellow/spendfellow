'use client';

import Image from 'next/image';
import { AppBar, Toolbar, Typography, Button, Container, Box } from '@mui/material';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home as HomeIcon,
  AccountBalance as AccountBalanceIcon,
  Receipt as ReceiptIcon,
  Category as CategoryIcon,
  Assessment as AssessmentIcon,
  Tune as TuneIcon,
} from '@mui/icons-material';

const navItems = [
  { label: 'Home', path: '/', icon: HomeIcon },
  { label: 'Accounts', path: '/accounts', icon: AccountBalanceIcon },
  { label: 'Transactions', path: '/transactions', icon: ReceiptIcon },
  { label: 'Budgets', path: '/budgets', icon: CategoryIcon },
  { label: 'Settings', path: '/settings', icon: TuneIcon },
  { label: 'Reports', path: '/reports', icon: AssessmentIcon },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <AppBar position="static">
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ minHeight: { xs: 64, md: 72 } }}>
          <Box
            component={Link}
            href="/"
            sx={{
              mr: { xs: 2, md: 4 },
              display: 'flex',
              alignItems: 'center',
              gap: 1.2,
              textDecoration: 'none',
              color: 'inherit',
              minWidth: { xs: 44, md: 190 },
            }}
          >
            <Box
              sx={{
                position: 'relative',
                width: 38,
                height: 38,
                borderRadius: 1.5,
                overflow: 'hidden',
                flex: '0 0 auto',
              }}
            >
              <Image src="/spendfellow-logo.png" alt="Spendfellow" fill sizes="38px" style={{ objectFit: 'cover' }} />
            </Box>
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <Typography variant="h6" sx={{ lineHeight: 1, fontWeight: 800, letterSpacing: 0 }}>
                Spend<span style={{ color: '#6DFF2E' }}>fellow</span>
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontWeight: 700,
                  letterSpacing: 1.6,
                  lineHeight: 1.3,
                }}
              >
                TRACK BUDGET ACHIEVE
              </Typography>
            </Box>
          </Box>

          <Box sx={{ flexGrow: 1, display: 'flex', gap: 0.75, overflowX: 'auto', py: 1 }}>
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
                    color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.76)',
                    flex: '0 0 auto',
                    border: isActive ? '1px solid rgba(98, 243, 63, 0.35)' : '1px solid transparent',
                    backgroundColor: isActive ? 'rgba(98, 243, 63, 0.12)' : 'transparent',
                    '&:hover': {
                      color: '#ffffff',
                      backgroundColor: 'rgba(124, 45, 255, 0.2)',
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
