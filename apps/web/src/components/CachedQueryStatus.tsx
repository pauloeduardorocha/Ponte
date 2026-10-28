import { Button, Stack, Typography } from '@mui/material';
import { formatDateTime } from '../lib/format';

export function CachedQueryStatus({
  updatedAt,
  refreshing,
  onRefresh,
  label,
}: {
  updatedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
  label: string;
}) {
  if (!updatedAt) return null;
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      gap={1}
    >
      <Typography variant="caption" color="text.secondary" aria-live="polite">
        {refreshing
          ? 'Atualizando dados…'
          : `Dados atualizados em ${formatDateTime(new Date(updatedAt).toISOString())}`}
      </Typography>
      <Button
        size="small"
        disabled={refreshing}
        aria-label={`Atualizar ${label}`}
        onClick={onRefresh}
      >
        Atualizar
      </Button>
    </Stack>
  );
}
