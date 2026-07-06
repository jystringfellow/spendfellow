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
      main: isDark ? '#8B3DFF' : '#6F3AD7',
      light: isDark ? '#B05CFF' : '#8B5CE8',
      dark: isDark ? '#5B22BF' : '#4C259D',
      contrastText: '#FFFFFF',
    },
    background: {
      default: isDark ? '#090A14' : '#F6F8F3',
      paper: isDark ? '#171A27' : '#FFFFFF',
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
    divider: isDark ? '#2B3145' : '#D9DFD3',
  },
  typography: {
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
          background: isDark
            ? 'radial-gradient(circle at top left, rgba(109, 255, 46, 0.08), transparent 34rem), radial-gradient(circle at top right, rgba(176, 92, 255, 0.1), transparent 32rem), #090A14'
            : 'radial-gradient(circle at top left, rgba(35, 138, 45, 0.08), transparent 34rem), radial-gradient(circle at top right, rgba(111, 58, 215, 0.08), transparent 32rem), #F6F8F3',
          color: isDark ? '#F7F8FC' : '#172017',
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
        },
        containedPrimary: {
          background: isDark
            ? 'linear-gradient(90deg, #6DFF2E 0%, #2DEB74 42%, #8B3DFF 100%)'
            : 'linear-gradient(90deg, #238A2D 0%, #35B343 48%, #6F3AD7 100%)',
          color: isDark ? '#090A14' : '#FFFFFF',
          '&:hover': {
            background: isDark
              ? 'linear-gradient(90deg, #8DFF62 0%, #2DEB74 38%, #B05CFF 100%)'
              : 'linear-gradient(90deg, #17621F 0%, #2E9F4A 48%, #4C259D 100%)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 12,
          border: `1px solid ${isDark ? '#2B3145' : '#D9DFD3'}`,
          boxShadow: isDark ? '0 12px 40px rgba(0, 0, 0, 0.24)' : '0 10px 32px rgba(23, 32, 23, 0.08)',
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
          borderBottom: `1px solid ${isDark ? '#2B3145' : '#D9DFD3'}`,
          boxShadow: isDark ? '0 10px 34px rgba(0, 0, 0, 0.28)' : '0 8px 28px rgba(23, 32, 23, 0.08)',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
        notchedOutline: {
          borderColor: isDark ? '#2B3145' : '#D9DFD3',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: isDark ? '#2B3145' : '#D9DFD3',
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
