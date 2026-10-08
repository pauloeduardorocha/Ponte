import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import { apiRequest } from '../../lib/api';
import { useDebouncedValue } from '../../lib/use-debounced-value';
type Message = {
  id: string;
  subject: string | null;
  content: string;
  sentAt: string;
};
export function InboxPage() {
  const [page, setPage] = useState(0),
    [search, setSearch] = useState(''),
    debounced = useDebouncedValue(search);
  const data = useQuery({
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
      {data.data?.items.map((m) => (
        <Card key={m.id} variant="outlined">
          <CardContent>
            <Typography variant="h6">
              {m.subject ?? 'Mensagem da comunidade'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {new Date(m.sentAt).toLocaleString('pt-PT')}
            </Typography>
            <Typography
              sx={{ mt: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {m.content}
            </Typography>
          </CardContent>
        </Card>
      ))}
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
