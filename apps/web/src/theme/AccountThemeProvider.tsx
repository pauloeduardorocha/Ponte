import { useMemo, type ReactNode } from 'react';
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { useAuth } from '../auth/auth-context';
import { createAppTheme } from './theme';
import { useLocale } from '../i18n';

export function AccountThemeProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const { user } = useAuth();
  const deviceDark = useMediaQuery('(prefers-color-scheme: dark)');
  const preference = user?.colorMode ?? 'system';
  const mode =
    preference === 'system' ? (deviceDark ? 'dark' : 'light') : preference;
  const theme = useMemo(() => createAppTheme(mode, locale), [mode, locale]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}
