import { t as translate, useLocale } from '../i18n';
import { LanguageSelect } from './LanguageSelect';
import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';

export function AuthCard({
  title,
  subtitle,
  notice,
  error,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  notice?: string | null;
  error?: string | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useLocale();
  return (
    <Box className="login-page">
      <Card variant="outlined" className="login-card">
        <CardContent>
          <Stack spacing={3}>
            <Box>
              <Box
                component="img"
                src="/logo.png"
                alt={translate('Logo de A Ponte')}
                width={64}
                height={64}
                className="auth-brand-logo"
              />
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography variant="overline" color="primary" fontWeight={700}>
                  A Ponte
                </Typography>
                <LanguageSelect />
              </Stack>
              <Typography variant="h4" component="h1" fontWeight={700}>
                {title}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                {subtitle}
              </Typography>
            </Box>
            {notice && (
              <Alert severity="success">{translate(notice ?? '')}</Alert>
            )}
            {error && <Alert severity="error">{translate(error ?? '')}</Alert>}
            {children}
            {footer && (
              <Stack spacing={1} alignItems="center">
                {footer}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
