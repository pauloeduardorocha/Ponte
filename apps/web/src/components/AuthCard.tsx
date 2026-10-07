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
  return (
    <Box className="login-page">
      <Card variant="outlined" className="login-card">
        <CardContent>
          <Stack spacing={3}>
            <Box>
              <Typography variant="overline" color="primary" fontWeight={700}>
                COMUNIDADE
              </Typography>
              <Typography variant="h4" component="h1" fontWeight={700}>
                {title}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                {subtitle}
              </Typography>
            </Box>
            {notice && <Alert severity="success">{notice}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
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
