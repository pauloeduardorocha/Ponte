import type { ReactNode } from 'react';
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { useAuth } from '../auth/auth-context';
import { createAppTheme } from './theme';

const themes = {
  light: createAppTheme('light'),
  dark: createAppTheme('dark'),
};

export function AccountThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const deviceDark = useMediaQuery('(prefers-color-scheme: dark)');
  const preference = user?.colorMode ?? 'system';
  const mode =
    preference === 'system' ? (deviceDark ? 'dark' : 'light') : preference;
  return (
    <ThemeProvider theme={themes[mode]}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}
