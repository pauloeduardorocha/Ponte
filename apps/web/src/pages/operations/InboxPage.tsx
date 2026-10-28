import { formatDateTime } from '../../lib/format';
import { RecordTable, RecordRow } from '../../components/RecordTable';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Chip,
  Skeleton,
  Stack,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import { apiRequest } from '../../lib/api';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { PushControls } from '../../components/PushControls';
type Message = {
  id: string;
  subject: string | null;
  content: string;
  sentAt: string;
  readAt: string | null;
};
export function InboxPage() {
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/operations/inbox/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      if (data.data?.items.length === 1 && page > 0) setPage(page - 1);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['operations', 'inbox'] }),
        client.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
  });
  const read = useMutation({
    mutationFn: (id?: string) =>
      apiRequest(
        id ? `/operations/inbox/${id}/read` : '/operations/inbox/read-all',
        { method: 'POST' },
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['operations', 'inbox'] }),
        client.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
  });
  const [page, setPage] = useState(0),
    [search, setSearch] = useState(''),
    debounced = useDebouncedValue(search);
  const data = useQuery({
    refetchInterval: 60 * 60_000,
    queryKey: ['operations', 'inbox', page, debounced],
    queryFn: () =>
      apiRequest<{ items: Message[]; total: number }>('/operations/inbox', {
        query: { page: page + 1, pageSize: 25, search: debounced },
      }),
  });
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Minhas notificações</Typography>
      <Typography color="text.secondary">
        Mensagens internas enviadas para o seu cadastro de membro.
      </Typography>
      <PushControls />
      <Button
        sx={{ alignSelf: 'flex-start' }}
        disabled={read.isPending || !data.data?.items.length}
        onClick={() => read.mutate(undefined)}
      >
        Marcar todas como lidas
      </Button>
      {read.isError && <Alert severity="error">{read.error.message}</Alert>}
      {remove.isError && <Alert severity="error">{remove.error.message}</Alert>}
      <TextField
        label="Pesquisar por assunto"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
      />
      {data.isPending && <Skeleton height={150} />}
      {data.isError && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void data.refetch()}>
              Tentar novamente
            </Button>
          }
        >
          {data.error.message}
        </Alert>
      )}
      {data.data?.items.length === 0 && (
        <Alert severity="info">Você ainda não tem mensagens internas.</Alert>
      )}
      <RecordTable
        hasActions={false}
        primaryLabel="Assunto"
        label={'Minhas notificações'}
        summaryLabel="Enviado em"
      >
        {data.data?.items.map((m) => (
          <RecordRow
            key={m.id}
            primary={
              <>
                <Typography variant="h6">
                  {m.subject ?? 'Mensagem de A Ponte'}
                </Typography>
                {!m.readAt && (
                  <Chip size="small" color="primary" label="Não lida" />
                )}
              </>
            }
            hasActions={false}
            actions={<></>}
            summary={
              <>
                <Typography variant="caption" color="text.secondary">
                  {formatDateTime(m.sentAt)}
                </Typography>
              </>
            }
          >
            <Typography
              sx={{ mt: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {m.content}
            </Typography>
            {!m.readAt && (
              <Button
                disabled={read.isPending}
                onClick={() => read.mutate(m.id)}
              >
                Marcar como lida
              </Button>
            )}
            <Button
              color="error"
              disabled={remove.isPending}
              aria-label={`Apagar mensagem: ${m.subject ?? 'Mensagem de A Ponte'}`}
              onClick={() => remove.mutate(m.id)}
            >
              Apagar
            </Button>
          </RecordRow>
        ))}
      </RecordTable>
      {data.data && (
        <TablePagination
          component="div"
          count={data.data.total}
          page={page}
          rowsPerPage={25}
          rowsPerPageOptions={[25]}
          onPageChange={(_, p) => setPage(p)}
        />
      )}
    </Stack>
  );
}
