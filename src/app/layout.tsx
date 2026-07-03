import type { Metadata } from 'next';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import theme from './theme';
import Navigation from '@/components/layout/Navigation';

export const metadata: Metadata = {
  title: 'Spendfellow - Personal Finance Tracker',
  description: 'A personal, spreadsheet-first finance app for tracking budgets and transactions',
  icons: {
    icon: '/spendfellow-logo.png',
    apple: '/spendfellow-logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
              <Navigation />
              <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default', py: 3 }}>
                {children}
              </Box>
            </Box>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
