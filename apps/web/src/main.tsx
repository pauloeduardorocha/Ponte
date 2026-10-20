import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import App from './App';
import './styles.css';
import { PwaControls } from './components/PwaControls';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: false },
  },
});
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#d91017', light: '#fff0f1', dark: '#ad0d13', contrastText: '#ffffff' },
    secondary: { main: '#42434a', contrastText: '#ffffff' },
    success: { main: '#24754c' },
    error: { main: '#b42318' },
    warning: { main: '#a85d08' },
    info: { main: '#2863a4' },
    background: { default: '#f7f8fa', paper: '#ffffff' },
    text: { primary: '#24252b', secondary: '#62646e' },
    divider: '#e5e7eb',
  },
  shape: { borderRadius: 10 },
  typography: { fontFamily: 'Inter, system-ui, sans-serif' },
  components: {
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <App />
          <PwaControls />
          <Analytics />
          <SpeedInsights />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
