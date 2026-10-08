import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Skeleton,
  Stack,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../lib/api';
import { STATUS_LABELS } from '../lib/status-labels';
import { StatusChip } from '../components/DataPresentation';
import { useDebouncedValue } from '../lib/use-debounced-value';
type Entry = {
  id: string;
  name: string;
  status: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  visitedAt?: string;
  startsAt?: string;
  location?: string;
  description?: string | null;
};
export function CommunityPage({ kind }: { kind: 'events' | 'visitors' }) {
  const { hasPermission } = useAuth();
  const allowed = hasPermission(
    kind === 'events' ? 'EVENT_READ' : 'VISITOR_READ',
  );
  const canWrite = hasPermission(
    kind === 'events' ? 'EVENT_WRITE' : 'VISITOR_WRITE',
  );
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<Entry | null | undefined>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const client = useQueryClient();
  const statuses =
    kind === 'events'
      ? ['SCHEDULED', 'COMPLETED', 'CANCELLED']
      : ['NEW', 'CONTACTED', 'ARCHIVED'];
  const fields =
    kind === 'events'
      ? [
          { key: 'name', label: 'Nome do evento', required: true },
          {
            key: 'startsAt',
            label: 'Data e hora local',
            type: 'datetime-local',
            required: true,
          },
          { key: 'location', label: 'Local', required: true },
          { key: 'description', label: 'Descrição' },
        ]
      : [
          { key: 'name', label: 'Nome', required: true },
          {
            key: 'visitedAt',
            label: 'Data da visita',
            type: 'date',
            required: true,
          },
          { key: 'email', label: 'E-mail', type: 'email' },
          { key: 'phone', label: 'Telefone' },
          { key: 'notes', label: 'Observações' },
        ];
  const data = useQuery({
    queryKey: ['community', kind, page, debounced, status],
    queryFn: () =>
      apiRequest<{ items: Entry[]; total: number }>(`/community/${kind}`, {
        query: { page: page + 1, pageSize: 25, search: debounced, status },
      }),
    enabled: allowed,
  });
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, string | null> = { ...values };
      if (kind === 'events' && body.startsAt)
        body.startsAt = new Date(body.startsAt).toISOString();
      for (const f of fields)
        if (!body[f.key] && !f.required) body[f.key] = null;
      return apiRequest(`/community/${kind}${edit ? '/' + edit.id : ''}`, {
        method: edit ? 'PATCH' : 'POST',
        body,
      });
    },
    onSuccess: () => {
      setEdit(undefined);
      setNotice('Cadastro salvo com sucesso.');
      void client.invalidateQueries({ queryKey: ['community'] });
    },
  });
  function open(entry: Entry | null) {
    save.reset();
    setSubmitted(false);
    setEdit(entry);
    const defaults: Record<string, string> = {
      status: entry?.status ?? statuses[0]!,
    };
    for (const f of fields) {
      const value = entry?.[f.key as keyof Entry];
      defaults[f.key] = typeof value === 'string' ? value : '';
    }
    if (entry?.startsAt) {
      const d = new Date(entry.startsAt);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      defaults.startsAt = d.toISOString().slice(0, 16);
    }
    if (entry?.visitedAt) defaults.visitedAt = entry.visitedAt.slice(0, 10);
    if (!entry && kind === 'visitors')
      defaults.visitedAt = new Date().toISOString().slice(0, 10);
    setValues(defaults);
  }
  if (!allowed)
    return (
      <Alert severity="warning">
        Você não tem permissão para consultar este cadastro.
      </Alert>
    );
  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h4">
          {kind === 'events' ? 'Eventos' : 'Visitantes'}
        </Typography>
        {canWrite && (
          <Button variant="contained" onClick={() => open(null)}>
            Cadastrar {kind === 'events' ? 'evento' : 'visitante'}
          </Button>
        )}
      </Stack>
      <Typography color="text.secondary">
        {kind === 'events'
          ? 'Organize a agenda e acompanhe a situação dos encontros.'
          : 'Acompanhe as visitas e o acolhimento da comunidade.'}
      </Typography>
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Pesquisar por nome"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          fullWidth
        />
        <TextField
          select
          label="Situação"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">Todas</MenuItem>
          {statuses.map((s) => (
            <MenuItem key={s} value={s}>
              {STATUS_LABELS[s]}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {data.isPending && (
        <Skeleton
          variant="rounded"
          height={180}
          aria-label="Carregando cadastros"
        />
      )}
      {data.isError && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void data.refetch()}>
              Tentar novamente
            </Button>
          }
        >
          Não foi possível carregar a lista.
        </Alert>
      )}
      {data.data?.items.length === 0 && (
        <Alert severity="info">
          Nenhum cadastro encontrado. Ajuste os filtros ou crie o primeiro
          registro.
        </Alert>
      )}
      {data.data?.items.map((item) => (
        <Card variant="outlined" key={item.id}>
          <CardContent>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="start"
              gap={2}
            >
              <Stack spacing={1}>
                <Typography variant="h6">{item.name}</Typography>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  <StatusChip status={item.status} />
                  <Typography variant="body2">
                    {kind === 'events'
                      ? new Date(item.startsAt!).toLocaleString('pt-PT')
                      : item.visitedAt?.slice(0, 10)}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {kind === 'events'
                    ? item.location
                    : [item.email, item.phone].filter(Boolean).join(' · ')}
                </Typography>
                {(item.notes || item.description) && (
                  <Typography variant="body2">
                    {item.notes ?? item.description}
                  </Typography>
                )}
              </Stack>
              {canWrite && <Button onClick={() => open(item)}>Editar</Button>}
            </Stack>
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
      <Dialog
        open={edit !== undefined}
        onClose={() => {
          if (!save.isPending) setEdit(undefined);
        }}
        fullWidth
        maxWidth="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (fields.every((f) => !f.required || values[f.key]?.trim()))
              save.mutate();
          }}
        >
          <DialogTitle>
            {edit ? 'Editar' : 'Cadastrar'}{' '}
            {kind === 'events' ? 'evento' : 'visitante'}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {save.isError && (
                <Alert severity="error">{save.error.message}</Alert>
              )}
              {fields.map((f) => (
                <TextField
                  key={f.key}
                  label={f.label}
                  required={f.required}
                  type={f.type ?? 'text'}
                  multiline={['notes', 'description'].includes(f.key)}
                  minRows={
                    ['notes', 'description'].includes(f.key) ? 3 : undefined
                  }
                  value={values[f.key] ?? ''}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.key]: e.target.value }))
                  }
                  error={submitted && !!f.required && !values[f.key]?.trim()}
                  helperText={
                    submitted && f.required && !values[f.key]?.trim()
                      ? 'Preencha este campo'
                      : undefined
                  }
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: {
                      maxLength:
                        f.key === 'name'
                          ? 120
                          : f.key === 'email'
                            ? 320
                            : f.key === 'phone'
                              ? 32
                              : 2000,
                    },
                  }}
                />
              ))}
              <TextField
                select
                label="Situação"
                value={values.status ?? statuses[0]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, status: e.target.value }))
                }
              >
                {statuses.map((s) => (
                  <MenuItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              disabled={save.isPending}
              onClick={() => setEdit(undefined)}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="contained" disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Stack>
  );
}
