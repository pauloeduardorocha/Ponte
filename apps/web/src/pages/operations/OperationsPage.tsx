import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { apiRequest } from '../../lib/api';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { StatusChip } from '../../components/DataPresentation';
import {
  configs,
  dayLabels,
  entryName,
  operationLabels,
  type Entry,
  type Field,
  type Resource,
} from './operation-config';
import { LookupField, OperationForm } from './OperationForm';
import { OperationDetail } from './OperationDetail';
type FormSpec = {
  title: string;
  path: string;
  method?: 'POST' | 'PATCH';
  fields: Field[];
  initial?: Entry;
};
export function OperationsPage({ resource }: { resource: Resource }) {
  const c = configs[resource],
    { hasPermission } = useAuth();
  const allowed = hasPermission(c.read),
    canCreate =
      hasPermission(c.create) &&
      (resource !== 'notification-templates' ||
        hasPermission('OPERATION_SCOPE_ALL')),
    canUpdate =
      hasPermission(c.update) &&
      (resource !== 'notification-templates' ||
        hasPermission('OPERATION_SCOPE_ALL'));
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? ''),
    debounced = useDebouncedValue(search);
  const [status, setStatus] = useState(params.get('status') ?? ''),
    [active, setActive] = useState(params.get('active') ?? ''),
    [start, setStart] = useState(''),
    [end, setEnd] = useState('');
  const [meetingDay, setMeetingDay] = useState(''),
    [page, setPage] = useState(0);
  const filterForm = useForm<Record<string, string | boolean>>({
    defaultValues: {},
  });
  const filters = useWatch({ control: filterForm.control });
  const filterKey = JSON.stringify(filters);
  useEffect(() => setPage(0), [filterKey]);
  const filterFields: Field[] =
    resource === 'follow-ups'
      ? [
          { key: 'memberId', label: 'Membro', lookup: 'people' },
          { key: 'visitorId', label: 'Visitante', lookup: 'visitors' },
          {
            key: 'assignedToUserId',
            label: 'Responsável',
            lookup: 'assignees',
          },
        ]
      : resource === 'small-groups' || resource === 'ministries'
        ? [{ key: 'leaderMemberId', label: 'Líder', lookup: 'people' }]
        : resource === 'events'
          ? [
              { key: 'ministryId', label: 'Ministério', lookup: 'ministries' },
              { key: 'smallGroupId', label: 'Grupo familiar', lookup: 'small-groups' },
            ]
          : resource === 'schedules'
            ? [
                { key: 'eventId', label: 'Evento', lookup: 'events' },
                {
                  key: 'ministryId',
                  label: 'Ministério',
                  lookup: 'ministries',
                },
                { key: 'memberId', label: 'Membro', lookup: 'people' },
              ]
            : resource === 'attendance'
              ? [
                  { key: 'memberId', label: 'Membro', lookup: 'people' },
                  { key: 'eventId', label: 'Evento', lookup: 'events' },
                  {
                    key: 'smallGroupId',
                    label: 'Grupo familiar',
                    lookup: 'small-groups',
                  },
                ]
              : resource === 'notifications'
                ? [
                    { key: 'memberId', label: 'Membro', lookup: 'people' },
                    {
                      key: 'visitorId',
                      label: 'Visitante',
                      lookup: 'visitors',
                    },
                  ]
                : [];
  const [form, setForm] = useState<FormSpec>(),
    [detail, setDetail] = useState<Entry>(),
    [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<{ path: string; text: string }>();
  const client = useQueryClient();
  const data = useQuery({
    queryKey: [
      'operations',
      resource,
      page,
      debounced,
      status,
      active,
      start,
      end,
      meetingDay,
      filterKey,
    ],
    queryFn: () =>
      apiRequest<{
        items: Entry[];
        total: number;
        summary?: { status: string; _count: { _all: number } }[];
      }>(`/operations/${resource}`, {
        query: {
          ...Object.fromEntries(
            Object.entries(filters).map(([k, v]) => [
              k,
              typeof v === 'string' ? v : undefined,
            ]),
          ),
          page: page + 1,
          pageSize: 25,
          search: debounced,
          status,
          active,
          start,
          end,
          meetingDay,
        },
      }),
    enabled: allowed,
  });
  const action = useMutation({
    mutationFn: (path: string) => apiRequest(path, { method: 'POST' }),
    onSuccess: () => {
      setConfirm(undefined);
      setNotice('Operação concluída.');
      void client.invalidateQueries({ queryKey: ['operations'] });
      void client.invalidateQueries({ queryKey: ['community'] });
    },
  });
  const open = (e?: Entry) => {
    const fields =
      resource === 'attendance' && e
        ? c.fields.filter((f) => f.key === 'status')
        : c.fields;
    setForm({
      title: e ? 'Editar registro' : 'Novo registro',
      path: `/operations/${resource}${e ? '/' + e.id : ''}`,
      method: e ? 'PATCH' : 'POST',
      fields,
      initial: e,
    });
  };
  if (!allowed)
    return (
      <Alert severity="warning">
        Você não tem permissão para acessar este módulo.
      </Alert>
    );
  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        gap={2}
        flexWrap="wrap"
        justifyContent="space-between"
      >
        <Typography variant="h4">{c.title}</Typography>
        <Stack direction="row" gap={1}>
          {resource === 'notifications' && (
            <Button component={Link} to="/notification-templates">
              Modelos
            </Button>
          )}
          {canCreate && (
            <Button variant="contained" onClick={() => open()}>
              Cadastrar
            </Button>
          )}
        </Stack>
      </Stack>
      <Typography color="text.secondary">
        Organize a vida da comunidade e acompanhe cada atividade. O acesso
        respeita suas responsabilidades.
      </Typography>
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      {action.isError && <Alert severity="error">{action.error.message}</Alert>}
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2} flexWrap="wrap">
        <TextField
          label="Pesquisar por nome"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        {c.statuses && (
          <TextField
            select
            label="Situação"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Todas</MenuItem>
            {c.statuses.map((s) => (
              <MenuItem key={s} value={s}>
                {operationLabels[s] ?? s}
              </MenuItem>
            ))}
          </TextField>
        )}
        {['small-groups', 'ministries', 'notification-templates'].includes(
          resource,
        ) ? (
          <TextField
            select
            label="Atividade"
            value={active}
            onChange={(e) => {
              setActive(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="true">Ativos</MenuItem>
            <MenuItem value="false">Inativos</MenuItem>
          </TextField>
        ) : (
          <>
            <TextField
              type="date"
              label="De"
              slotProps={{ inputLabel: { shrink: true } }}
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setPage(0);
              }}
            />
            <TextField
              type="date"
              label="Até"
              slotProps={{ inputLabel: { shrink: true } }}
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setPage(0);
              }}
            />
          </>
        )}
        {resource === 'small-groups' && (
          <TextField
            select
            label="Dia"
            value={meetingDay}
            onChange={(e) => {
              setMeetingDay(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">Todos</MenuItem>
            {dayLabels.map((d, i) => (
              <MenuItem key={d} value={String(i)}>
                {d}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Button
          onClick={() => {
            setSearch('');
            setStatus('');
            setActive('');
            setStart('');
            setEnd('');
            setMeetingDay('');
            setPage(0);
          }}
        >
          Limpar filtros
        </Button>
      </Stack>
      {!!filterFields.length && (
        <details>
          <summary>Filtros por pessoa e atividade</summary>
          <Stack spacing={2} sx={{ mt: 2, maxWidth: 600 }}>
            {filterFields.map((f) => (
              <LookupField key={f.key} field={f} control={filterForm.control} />
            ))}
          </Stack>
        </details>
      )}
      {data.isPending && (
        <Skeleton
          variant="rounded"
          height={180}
          aria-label="Carregando registros"
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
          {data.error.message}
        </Alert>
      )}
      {data.data?.items.length === 0 && (
        <Alert severity="info">
          Nenhum registro encontrado. Ajuste os filtros ou cadastre o primeiro.
        </Alert>
      )}
      {data.data?.summary && (
        <Stack direction="row" gap={2} flexWrap="wrap">
          {data.data.summary.map((s) => (
            <Typography key={s.status}>
              {operationLabels[s.status]}: {s._count._all}
            </Typography>
          ))}
        </Stack>
      )}
      {data.data?.items.map((e) => (
        <Card
          key={e.id}
          variant="outlined"
          sx={{
            borderLeft: 4,
            borderLeftColor:
              e.active === false || e.status === 'CANCELLED'
                ? 'text.disabled'
                : e.status === 'ABSENT'
                  ? 'error.main'
                  : 'primary.main',
          }}
        >
          <CardContent>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              gap={2}
            >
              <Stack spacing={1}>
                <Typography variant="h6">{entryName(e)}</Typography>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  {typeof e.status === 'string' && (
                    <StatusChip status={e.status} />
                  )}
                  <Typography variant="body2">
                    {e.active === true
                      ? 'Ativo'
                      : e.active === false
                        ? 'Inativo'
                        : ''}
                  </Typography>
                </Stack>
                {[
                  'visitedAt',
                  'nextContactAt',
                  'startsAt',
                  'date',
                  'attendanceDate',
                  'scheduledAt',
                ].map((k) =>
                  e[k] ? (
                    <Typography key={k} variant="body2">
                      {
                        (
                          {
                            visitedAt: 'Primeira visita',
                            nextContactAt: 'Próximo contato',
                            startsAt: 'Início',
                            date: 'Data',
                            attendanceDate: 'Presença',
                            scheduledAt: 'Agendamento',
                          } as Record<string, string>
                        )[k]
                      }
                      : {new Date(String(e[k])).toLocaleString('pt-PT')}
                    </Typography>
                  ) : null,
                )}
                {[
                  'leader',
                  'assignedTo',
                  'event',
                  'ministry',
                  'smallGroup',
                  'recipientMember',
                  'recipientVisitor',
                ].map((k) =>
                  e[k] ? (
                    <Typography key={k} variant="body2" color="text.secondary">
                      {
                        (
                          {
                            leader: 'Líder',
                            assignedTo: 'Responsável',
                            event: 'Evento',
                            ministry: 'Ministério',
                            smallGroup: 'Grupo familiar',
                            recipientMember: 'Membro',
                            recipientVisitor: 'Visitante',
                          } as Record<string, string>
                        )[k]
                      }
                      : {entryName(e[k] as Entry)}
                    </Typography>
                  ) : null,
                )}
                {typeof e.meetingDay === 'number' && (
                  <Typography>
                    {dayLabels[e.meetingDay]} · {String(e.meetingTime)}
                  </Typography>
                )}
                {[
                  'location',
                  'address',
                  'email',
                  'phone',
                  'description',
                  'notes',
                  'content',
                ].map((k) =>
                  e[k] ? (
                    <Typography
                      variant="body2"
                      key={k}
                      sx={{ overflowWrap: 'anywhere' }}
                    >
                      {String(e[k])}
                    </Typography>
                  ) : null,
                )}
              </Stack>
              <Stack direction="row" gap={1} flexWrap="wrap" alignItems="start">
                {![
                  'attendance',
                  'notifications',
                  'notification-templates',
                ].includes(resource) && (
                  <Button onClick={() => setDetail(e)}>Detalhes</Button>
                )}
                {canUpdate && !['notifications'].includes(resource) && (
                  <Button onClick={() => open(e)}>Editar</Button>
                )}
                {resource === 'notifications' &&
                  canUpdate &&
                  e.status === 'PENDING' && (
                    <>
                      <Button
                        onClick={() =>
                          action.mutate(
                            `/operations/notifications/${e.id}/send`,
                          )
                        }
                        disabled={action.isPending}
                      >
                        Enviar
                      </Button>
                      <Button
                        color="error"
                        onClick={() =>
                          setConfirm({
                            path: `/operations/notifications/${e.id}/cancel`,
                            text: 'Cancelar notificação?',
                          })
                        }
                      >
                        Cancelar
                      </Button>
                    </>
                  )}
              </Stack>
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
      {form && (
        <OperationForm
          key={form.path}
          {...form}
          onClose={() => setForm(undefined)}
          onSaved={() => {
            setForm(undefined);
            setNotice('Cadastro salvo com sucesso.');
          }}
        />
      )}
      {detail && (
        <OperationDetail
          resource={resource}
          entry={detail}
          onClose={() => setDetail(undefined)}
        />
      )}
      <Dialog open={!!confirm} onClose={() => setConfirm(undefined)}>
        <DialogTitle>{confirm?.text}</DialogTitle>
        <DialogContent>O histórico será preservado.</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(undefined)}>Voltar</Button>
          <Button
            color="error"
            disabled={action.isPending}
            onClick={() => confirm && action.mutate(confirm.path)}
          >
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
