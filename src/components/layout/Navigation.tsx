'use client';

import Image from 'next/image';
import { AppBar, Toolbar, Typography, Button, Container, Box, IconButton, Tooltip } from '@mui/material';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home as HomeIcon,
  AccountBalance as AccountBalanceIcon,
  Receipt as ReceiptIcon,
  Category as CategoryIcon,
  Assessment as AssessmentIcon,
  Tune as TuneIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
} from '@mui/icons-material';
import { useAppThemeMode } from '@/components/layout/AppThemeProvider';

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
  const { mode, toggleMode } = useAppThemeMode();
  const isDark = mode === 'dark';

  return (
    <AppBar position="static">
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ minHeight: { xs: 72, md: 86 } }}>
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
              minWidth: { xs: 56, md: 220 },
            }}
          >
            <Box
              sx={{
                position: 'relative',
                width: { xs: 48, md: 56 },
                height: { xs: 48, md: 56 },
                borderRadius: 1.5,
                overflow: 'hidden',
                flex: '0 0 auto',
              }}
            >
              <Image
                src="/spendfellow-logo.png"
                alt="Spendfellow"
                fill
                sizes="(max-width: 900px) 48px, 56px"
                style={{ objectFit: 'cover' }}
              />
            </Box>
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <Typography variant="h6" sx={{ lineHeight: 1, fontWeight: 800, letterSpacing: 0 }}>
                Spend<span style={{ color: isDark ? '#6DFF2E' : '#238A2D' }}>fellow</span>
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  color: 'text.secondary',
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
                    color: isActive ? 'text.primary' : 'text.secondary',
                    flex: '0 0 auto',
                    border: isActive ? '1px solid' : '1px solid transparent',
                    borderColor: isActive ? 'primary.main' : 'transparent',
                    backgroundColor: isActive ? 'action.selected' : 'transparent',
                    '&:hover': {
                      color: 'text.primary',
                      backgroundColor: 'action.hover',
                    },
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Box>
          <Tooltip title={`Switch to ${isDark ? 'light' : 'dark'} mode`}>
            <IconButton
              color="inherit"
              aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
              onClick={toggleMode}
              sx={{
                ml: 1,
                border: '1px solid',
                borderColor: 'divider',
                color: 'text.secondary',
                '&:hover': {
                  color: 'text.primary',
                  borderColor: 'primary.main',
                },
              }}
            >
              {isDark ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
