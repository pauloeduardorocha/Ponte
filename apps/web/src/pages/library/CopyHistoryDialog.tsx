import { RecordTable, RecordRow } from '../../components/RecordTable';
import { STATUS_LABELS } from '../../lib/status-labels';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { QueryError } from '../../components/PageParts';
import { formatDate } from '../../lib/format';
import * as api from '../../lib/library-api';
import { HistoryContent, HistoryPagination } from './LibraryHistory';
export function CopyHistoryDialog({
  id,
  close,
}: {
  id: string;
  close: () => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const history = useQuery({
    queryKey: ['library', 'copy-history', id, page, pageSize],
    queryFn: () => api.getCopyHistory(id, { page, pageSize }),
  });
  return (
    <Dialog open onClose={close} fullWidth maxWidth="md">
      <DialogTitle>Histórico completo do exemplar</DialogTitle>
      <DialogContent>
        {history.isPending && <CircularProgress />}
        {history.isError && (
          <QueryError
            error={history.error}
            onRetry={() => void history.refetch()}
          />
        )}
        {history.data && (
          <Stack spacing={2}>
            <Typography>
              {history.data.copy.assetCode} · {history.data.copy.status} ·{' '}
              {STATUS_LABELS[history.data.copy.condition ?? ''] ??
                history.data.copy.condition}{' '}
              · {history.data.copy.location}
            </Typography>
            <HistoryContent history={history.data} />
            <Typography variant="h6">
              Auditoria / manutenção / mudanças de status
            </Typography>
            <RecordTable hasActions={false} primaryLabel="Ação">
              {history.data.events.map((event) => (
                <RecordRow
                  key={event.id}
                  hasActions={false}
                  primary={<Typography>{event.action}</Typography>}
                >
                  <Typography variant="body2">
                    {formatDate(event.createdAt)} ·{' '}
                    {event.actorId ?? 'automático'} ·{' '}
                    {JSON.stringify(event.metadata)}
                  </Typography>
                </RecordRow>
              ))}
            </RecordTable>
            <HistoryPagination
              history={history.data}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}
