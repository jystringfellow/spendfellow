'use client';

import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#6DFF2E',
      light: '#8DFF62',
      dark: '#2DEB74',
      contrastText: '#090A14',
    },
    secondary: {
      main: '#8B3DFF',
      light: '#B05CFF',
      dark: '#5B22BF',
      contrastText: '#F7F8FC',
    },
    background: {
      default: '#090A14',
      paper: '#171A27',
    },
    text: {
      primary: '#F7F8FC',
      secondary: '#C5CAD9',
    },
    success: {
      main: '#39E67A',
      dark: '#1DA555',
      contrastText: '#090A14',
    },
    warning: {
      main: '#FFC857',
      contrastText: '#090A14',
    },
    error: {
      main: '#FF5D73',
    },
    info: {
      main: '#4DA9FF',
    },
    divider: '#2B3145',
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
          background:
            'radial-gradient(circle at top left, rgba(109, 255, 46, 0.08), transparent 34rem), radial-gradient(circle at top right, rgba(176, 92, 255, 0.1), transparent 32rem), #090A14',
          color: '#F7F8FC',
        },
        'input[type="date"]': {
          colorScheme: 'light',
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
          background: 'linear-gradient(90deg, #6DFF2E 0%, #2DEB74 42%, #8B3DFF 100%)',
          color: '#090A14',
          '&:hover': {
            background: 'linear-gradient(90deg, #8DFF62 0%, #2DEB74 38%, #B05CFF 100%)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 12,
          border: '1px solid #2B3145',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.24)',
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
          backgroundColor: '#090A14',
          borderBottom: '1px solid #2B3145',
          boxShadow: '0 10px 34px rgba(0, 0, 0, 0.28)',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
        notchedOutline: {
          borderColor: '#2B3145',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: '#2B3145',
        },
        head: {
          color: '#8D94AA',
          fontWeight: 700,
        },
      },
    },
  },
});

export default theme;
