'use client';

import { createTheme } from '@mui/material/styles';

export type AppColorMode = 'light' | 'dark';

export function createAppTheme(mode: AppColorMode) {
  const isDark = mode === 'dark';

  return createTheme({
  palette: {
    mode,
    primary: {
      main: isDark ? '#6DFF2E' : '#238A2D',
      light: isDark ? '#8DFF62' : '#35B343',
      dark: isDark ? '#2DEB74' : '#17621F',
      contrastText: isDark ? '#090A14' : '#FFFFFF',
    },
    secondary: {
      main: isDark ? '#B28AFF' : '#6F3AD7',
      light: isDark ? '#B05CFF' : '#8B5CE8',
      dark: isDark ? '#5B22BF' : '#4C259D',
      contrastText: '#FFFFFF',
    },
    background: {
      default: isDark ? '#101113' : '#F7F7F5',
      paper: isDark ? '#191A1E' : '#FFFFFF',
    },
    text: {
      primary: isDark ? '#F7F8FC' : '#172017',
      secondary: isDark ? '#C5CAD9' : '#5B655B',
    },
    success: {
      main: isDark ? '#39E67A' : '#2E9F4A',
      dark: isDark ? '#1DA555' : '#1F7134',
      contrastText: isDark ? '#090A14' : '#FFFFFF',
    },
    warning: {
      main: isDark ? '#FFC857' : '#A86D00',
      contrastText: isDark ? '#090A14' : '#FFFFFF',
    },
    error: {
      main: isDark ? '#FF5D73' : '#C9364A',
    },
    info: {
      main: isDark ? '#4DA9FF' : '#226FB3',
    },
    divider: isDark ? '#2D2E35' : '#E2E3DF',
  },
  typography: {
    h1: { fontWeight: 750, letterSpacing: '-0.04em' },
    h2: { fontWeight: 750, letterSpacing: '-0.035em' },
    h4: { fontWeight: 700, letterSpacing: '-0.03em' },
    h5: { fontWeight: 700, letterSpacing: '-0.02em' },
    h6: { fontWeight: 650, letterSpacing: '-0.015em' },
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: isDark ? '#101113' : '#F7F7F5',
          color: isDark ? '#F7F8FC' : '#172017',
        },
        ':where(a, button, input, select, textarea):focus-visible': {
          outline: `2px solid ${isDark ? '#6DFF2E' : '#238A2D'}`,
          outlineOffset: 4,
        },
        '::selection': {
          backgroundColor: isDark ? '#6139A8' : '#E8DCF9',
        },
        'input[type="date"]': {
          colorScheme: mode,
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 12,
          fontWeight: 650,
          minHeight: 40,
        },
        containedPrimary: {
          backgroundColor: isDark ? '#6DFF2E' : '#238A2D',
          color: isDark ? '#101113' : '#FFFFFF',
          '&:hover': {
            backgroundColor: isDark ? '#8DFF62' : '#17621F',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 12,
          border: `1px solid ${isDark ? '#2D2E35' : '#E2E3DF'}`,
          boxShadow: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: isDark ? '#090A14' : '#FFFFFF',
          color: isDark ? '#F7F8FC' : '#172017',
          borderBottom: `1px solid ${isDark ? '#2D2E35' : '#E2E3DF'}`,
          boxShadow: 'none',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
        notchedOutline: {
          borderColor: isDark ? '#2D2E35' : '#E2E3DF',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: isDark ? '#2D2E35' : '#E2E3DF',
          fontVariantNumeric: 'tabular-nums',
        },
        head: {
          color: isDark ? '#8D94AA' : '#687266',
          fontWeight: 700,
        },
      },
    },
  },
});
}

const theme = createAppTheme('dark');

export default theme;
