import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import App from './App';
import './styles.css';
import { PwaControls } from './components/PwaControls';
import { getAccessToken } from './lib/api';
import { initFrontendErrorReporting } from './lib/frontend-error-reporting';
import { FrontendErrorBoundary } from './components/FrontendErrorBoundary';

initFrontendErrorReporting(getAccessToken);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <FrontendErrorBoundary>
          <App />
        </FrontendErrorBoundary>
        <PwaControls />
        <Analytics />
        <SpeedInsights />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
