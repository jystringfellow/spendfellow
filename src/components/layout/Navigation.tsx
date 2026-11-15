'use client';

import Image from 'next/image';
import { AppBar, Toolbar, Typography, Button, Container, Box, IconButton, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HomeOutlined as HomeIcon,
  AccountBalanceOutlined as AccountBalanceIcon,
  ReceiptLongOutlined as ReceiptIcon,
  CategoryOutlined as CategoryIcon,
  Tune as TuneIcon,
  DarkModeOutlined as DarkModeIcon,
  LightModeOutlined as LightModeIcon,
} from '@mui/icons-material';
import { useAppThemeMode } from '@/components/layout/AppThemeProvider';

const navItems = [
  { label: 'Home', path: '/', icon: HomeIcon },
  { label: 'Accounts', path: '/accounts', icon: AccountBalanceIcon },
  { label: 'Transactions', path: '/transactions', icon: ReceiptIcon },
  { label: 'Budgets', path: '/budgets', icon: CategoryIcon },
  { label: 'Settings', path: '/settings', icon: TuneIcon },
];

export default function Navigation() {
  const pathname = usePathname();
  const { mode, toggleMode } = useAppThemeMode();
  const isDark = mode === 'dark';

  return (
    <AppBar position="static" elevation={0}>
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ minHeight: 76, gap: 3, flexWrap: 'wrap', py: { xs: 1.5, md: 0 } }}>
          <Box component={Link} href="/" aria-label="Spendfellow home"
            sx={{ display: 'flex', alignItems: 'center', gap: 1.25, textDecoration: 'none', color: 'inherit', mr: 'auto' }}>
            <Image src="/spendfellow-logo.png" alt="" width={40} height={40} style={{ borderRadius: 10 }} />
            <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.04em' }}>
              Spend<Box component="span" sx={{ color: 'primary.main' }}>fellow</Box>
              <Box component="span" sx={{ color: 'secondary.main' }}>.</Box>
            </Typography>
          </Box>
          <Box component="nav" aria-label="Main navigation" sx={{
            display: 'flex', gap: 0.5,
            order: { xs: 3, md: 0 }, width: { xs: '100%', md: 'auto' },
            justifyContent: { xs: 'space-between', md: 'initial' },
          }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(`${item.path}/`));
              return (
                <Button key={item.path} component={Link} href={item.path}
                  aria-current={isActive ? 'page' : undefined}
                  sx={{
                    minWidth: 0, flex: { xs: 1, md: 'initial' },
                    px: { xs: 0.5, md: 1.5 }, py: 1,
                    flexDirection: { xs: 'column', md: 'row' }, gap: 0.75,
                    fontSize: { xs: '0.65rem', sm: '0.8rem' },
                    color: isActive ? 'primary.main' : 'text.secondary',
                    bgcolor: (theme) => isActive ? alpha(theme.palette.primary.main, 0.09) : 'transparent',
                    '&:hover': { color: 'primary.main', bgcolor: 'action.hover' },
                  }}>
                  <Icon sx={{ fontSize: 19 }} />{item.label}
                </Button>
              );
            })}
          </Box>
          <Tooltip title={`Switch to ${isDark ? 'light' : 'dark'} mode`}>
            <IconButton aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`} onClick={toggleMode}
              sx={{ color: 'text.secondary', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              {isDark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
