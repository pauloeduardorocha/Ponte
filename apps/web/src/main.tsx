import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: false },
  },
});
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#245b4a' },
    secondary: { main: '#6554a6' },
    success: { main: '#24754c' },
    error: { main: '#ba3646' },
    warning: { main: '#a85d08' },
    info: { main: '#2863a4' },
    background: { default: '#f7f8fa' },
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
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
