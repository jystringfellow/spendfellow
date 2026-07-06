'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme, type AppColorMode } from '@/app/theme';

interface AppThemeContextValue {
  mode: AppColorMode;
  toggleMode: () => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);
const STORAGE_KEY = 'spendfellow-color-mode';
const COOKIE_KEY = 'spendfellow-color-mode';

export function useAppThemeMode() {
  const context = useContext(AppThemeContext);

  if (!context) {
    throw new Error('useAppThemeMode must be used inside AppThemeProvider.');
  }

  return context;
}

export default function AppThemeProvider({
  children,
  initialMode,
}: {
  children: ReactNode;
  initialMode: AppColorMode;
}) {
  const [mode, setMode] = useState<AppColorMode>(initialMode);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, mode);
    document.cookie = `${COOKIE_KEY}=${mode}; path=/; max-age=31536000; samesite=lax`;
  }, [isHydrated, mode]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const value = useMemo(
    () => ({
      mode,
      toggleMode: () => setMode((currentMode) => (currentMode === 'dark' ? 'light' : 'dark')),
    }),
    [mode]
  );

  return (
    <AppThemeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppThemeContext.Provider>
  );
}
