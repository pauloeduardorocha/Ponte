import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import App from './App';
import './styles.css';
import { PwaControls } from './components/PwaControls';
import { getAccessToken } from './lib/api';
import { initFrontendErrorReporting } from './lib/frontend-error-reporting';
import { FrontendErrorBoundary } from './components/FrontendErrorBoundary';
import { NetworkStatusBanner } from './components/NetworkStatusBanner';
import { createQueryClient } from './lib/query-client';

initFrontendErrorReporting(getAccessToken);

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NetworkStatusBanner />
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
