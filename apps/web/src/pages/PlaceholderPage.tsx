import { Alert, Stack, Typography } from '@mui/material';

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1" fontWeight={700}>
        {title}
      </Typography>
      <Alert severity="info">
        Esta área será disponibilizada em uma próxima etapa do projeto.
      </Alert>
    </Stack>
  );
}
