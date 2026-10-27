import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { checkForAppUpdate, UPDATE_MESSAGE } from '../lib/app-update';
import { reportFrontendError } from '../lib/frontend-error-reporting';

export class FrontendErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; checking: boolean; newer: boolean }
> {
  state = { failed: false, checking: true, newer: false };
  private mounted = false;
  componentDidMount() {
    this.mounted = true;
  }
  componentWillUnmount() {
    this.mounted = false;
  }
  static getDerivedStateFromError() {
    return { failed: true, checking: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    reportFrontendError('runtime', error.message, {
      stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`.slice(
        0,
        8000,
      ),
    });
    void checkForAppUpdate().then((version) => {
      if (this.mounted) this.setState({ checking: false, newer: !!version });
    });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Box sx={{ p: 3 }}>
        {this.state.checking ? (
          <Typography role="status">
            Verificando se há uma nova versão…
          </Typography>
        ) : (
          <Alert severity={this.state.newer ? 'info' : 'error'}>
            {this.state.newer
              ? UPDATE_MESSAGE
              : 'Não foi possível carregar esta tela. Tente novamente mais tarde.'}
          </Alert>
        )}
      </Box>
    );
  }
}
