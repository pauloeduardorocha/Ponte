import { Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { formatDateTime } from '../lib/format';
import { invalidateResponseCache } from '../lib/response-cache';

export function CachedQueryRefreshButton({
  refreshing,
  onRefresh,
  label,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  label: string;
}) {
  return (
    <Tooltip title={`Atualizar ${label}`}>
      <span>
        <IconButton
          aria-label={`Atualizar ${label}`}
          disabled={refreshing}
          onClick={() => {
            void invalidateResponseCache().then(onRefresh);
          }}
        >
          <RefreshRounded />
        </IconButton>
      </span>
    </Tooltip>
  );
}

export function CachedQueryStatus({
  updatedAt,
  refreshing,
  onRefresh,
  label,
  refreshButton = 'text',
}: {
  updatedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
  label: string;
  refreshButton?: 'text' | 'icon' | 'hidden';
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
          : `Dados carregados em ${formatDateTime(new Date(updatedAt).toISOString())}`}
      </Typography>
      {refreshButton === 'icon' && (
        <CachedQueryRefreshButton
          refreshing={refreshing}
          onRefresh={onRefresh}
          label={label}
        />
      )}
      {refreshButton === 'text' && (
        <Button
          size="small"
          disabled={refreshing}
          aria-label={`Atualizar ${label}`}
          onClick={() => {
            void invalidateResponseCache().then(onRefresh);
          }}
        >
          Atualizar
        </Button>
      )}
    </Stack>
  );
}
