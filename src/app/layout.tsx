import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter';
import { Box } from '@mui/material';
import type { AppColorMode } from '@/app/theme';
import AppThemeProvider from '@/components/layout/AppThemeProvider';
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
  const storedMode = cookies().get('spendfellow-color-mode')?.value;
  const initialMode: AppColorMode = storedMode === 'light' || storedMode === 'dark' ? storedMode : 'dark';

  return (
    <html lang="en">
      <body>
        <AppRouterCacheProvider>
          <AppThemeProvider initialMode={initialMode}>
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
              <Navigation />
              <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default', py: 3 }}>
                {children}
              </Box>
            </Box>
          </AppThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
