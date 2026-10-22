import { createTheme } from '@mui/material/styles';

export function createAppTheme(mode: 'light' | 'dark') {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: {
        main: dark ? '#ff7379' : '#d91017',
        light: dark ? '#ff9ba0' : '#fff0f1',
        dark: dark ? '#f36069' : '#ad0d13',
        contrastText: dark ? '#240507' : '#ffffff',
      },
      secondary: {
        main: dark ? '#bec0cc' : '#42434a',
        contrastText: dark ? '#1e2026' : '#ffffff',
      },
      success: { main: dark ? '#78dba5' : '#24754c' },
      error: { main: dark ? '#ff9b92' : '#b42318' },
      warning: { main: dark ? '#f4bf65' : '#a85d08' },
      info: { main: dark ? '#91c4ff' : '#2863a4' },
      background: {
        default: dark ? '#141519' : '#f7f8fa',
        paper: dark ? '#1e2026' : '#ffffff',
      },
      text: {
        primary: dark ? '#f1f2f5' : '#24252b',
        secondary: dark ? '#b8bac5' : '#62646e',
      },
      divider: dark ? '#3a3d48' : '#e5e7eb',
    },
    shape: { borderRadius: 10 },
    typography: { fontFamily: 'Inter, system-ui, sans-serif' },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            '--app-background': dark ? '#141519' : '#f7f8fa',
            '--app-text-secondary': dark ? '#b8bac5' : '#62646e',
            '--app-nav-text': dark ? '#d0d2dc' : '#555760',
            '--app-divider': dark ? '#3a3d48' : '#e5e7eb',
            '--app-header': dark
              ? 'rgba(30, 32, 38, 0.96)'
              : 'rgba(255, 255, 255, 0.96)',
            '--app-avatar-bg': dark ? '#49272d' : '#fff0f1',
            '--app-avatar-text': dark ? '#ffadb1' : '#ad0d13',
            '--app-empty-border': dark ? '#525564' : '#d5d7de',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 650, minHeight: 40 },
        },
      },
      MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },
      MuiCard: { defaultProps: { variant: 'outlined' } },
      MuiTab: {
        styleOverrides: { root: { textTransform: 'none', fontWeight: 650 } },
      },
      MuiDialogActions: { styleOverrides: { root: { padding: 20, gap: 8 } } },
    },
  });
}
