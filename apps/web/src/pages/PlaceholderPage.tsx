import { t as translate, useLocale } from '../i18n';
import { Alert, Stack, Typography } from '@mui/material';

export function PlaceholderPage({ title }: { title: string }) {
  useLocale();
  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1" fontWeight={700}>
        {title}
      </Typography>
      <Alert severity="info">
        {translate(
          'Esta área será disponibilizada em uma próxima etapa do projeto.',
        )}
      </Alert>
    </Stack>
  );
}
