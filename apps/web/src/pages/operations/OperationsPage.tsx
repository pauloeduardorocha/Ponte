import { t as translate, useLocale } from '../../i18n';
import { LocalizedTextField as TextField } from '../../components/LocalizedTextField';
import { formatDateTime } from '../../lib/format';
import { MemberPortalPage } from '../MemberPortalPage';
import { RecordTable, RecordRow } from '../../components/RecordTable';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Skeleton,
  Stack,
  TablePagination,
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
  useLocale();
  const c = configs[resource],
    { hasPermission, user } = useAuth();
  const ministryAdmin =
    hasPermission('OPERATION_SCOPE_ALL') &&
    (!user?.roles ||
      user.roles.some((role) => ['ADMIN', 'SUPER_ADMIN'].includes(role)));
  const allowed =
      hasPermission(c.read) ||
      (['ministries', 'schedules'].includes(resource) &&
        hasPermission('COMMUNITY_READ')),
    canCreate =
      (hasPermission(c.create) ||
        (resource === 'schedules' && hasPermission('COMMUNITY_READ')) ||
        (resource === 'events' && hasPermission('EVENT_CREATE'))) &&
      (resource !== 'notification-templates' ||
        hasPermission('OPERATION_SCOPE_ALL')) &&
      (resource !== 'ministries' || ministryAdmin),
    canUpdate =
      (hasPermission(c.update) ||
        (resource === 'events' && hasPermission('EVENT_UPDATE'))) &&
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
  const filterForm = useForm<Record<string, string | boolean | string[]>>({
    defaultValues: params.get('ministryId')
      ? { ministryId: params.get('ministryId')! }
      : {},
  });
  const filters = useWatch({ control: filterForm.control });
  const filterKey = JSON.stringify(filters);
  useEffect(() => setPage(0), [filterKey]);
  const filterFields: Field[] =
    resource === 'follow-ups'
      ? [
          { key: 'memberId', label: translate('Membro'), lookup: 'people' },
          {
            key: 'visitorId',
            label: translate('Visitante'),
            lookup: 'visitors',
          },
          {
            key: 'assignedToUserId',
            label: translate('Responsável'),
            lookup: 'assignees',
          },
        ]
      : resource === 'small-groups' || resource === 'ministries'
        ? [
            {
              key: 'leaderMemberId',
              label: translate('Líder'),
              lookup: 'people',
            },
          ]
        : resource === 'events'
          ? [
              {
                key: 'ministryId',
                label: translate('Ministério'),
                lookup: 'ministries',
              },
              {
                key: 'smallGroupId',
                label: translate('Grupo familiar'),
                lookup: 'small-groups',
              },
            ]
          : resource === 'schedules'
            ? [
                {
                  key: 'eventId',
                  label: translate('Evento'),
                  lookup: 'events',
                },
                {
                  key: 'ministryId',
                  label: translate('Ministério'),
                  lookup: 'ministries',
                },
                {
                  key: 'memberId',
                  label: translate('Membro'),
                  lookup: 'people',
                },
              ]
            : resource === 'notifications'
              ? [
                  {
                    key: 'memberId',
                    label: translate('Membro'),
                    lookup: 'people',
                  },
                  {
                    key: 'visitorId',
                    label: translate('Visitante'),
                    lookup: 'visitors',
                  },
                ]
              : [];
  const [form, setForm] = useState<FormSpec>(),
    [detail, setDetail] = useState<Entry>(),
    [notice, setNotice] = useState<{
      text: string;
      severity: 'success' | 'error' | 'warning';
    }>();
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
        canCreate?: boolean;
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
    enabled: allowed && params.get('view') !== 'community',
  });
  const action = useMutation({
    mutationFn: (path: string) => apiRequest(path, { method: 'POST' }),
    onSuccess: () => {
      setConfirm(undefined);
      setNotice({
        text: translate('Operação concluída.'),
        severity: 'success',
      });
      void client.invalidateQueries({ queryKey: ['operations'] });
      void client.invalidateQueries({ queryKey: ['community'] });
    },
  });
  const open = (e?: Entry) => {
    const fields = c.fields;
    setForm({
      title: e ? translate('Editar registro') : translate('Novo registro'),
      path: `/operations/${resource}${e ? '/' + e.id : ''}`,
      method: e ? 'PATCH' : 'POST',
      fields,
      initial:
        e ??
        (resource === 'schedules' && params.get('ministryId')
          ? { id: '', ministryId: params.get('ministryId')! }
          : undefined),
    });
  };
  if (
    (!allowed || params.get('view') === 'community') &&
    ['events', 'small-groups', 'ministries'].includes(resource)
  )
    return (
      <MemberPortalPage
        key={resource}
        resource={resource as 'events' | 'small-groups' | 'ministries'}
      />
    );
  if (!allowed)
    return (
      <Alert severity="warning">
        {translate('Você não tem permissão para acessar este módulo.')}
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
              {translate('Modelos')}
            </Button>
          )}
          {canCreate &&
            (resource !== 'schedules' || data.data?.canCreate === true) && (
              <Button variant="contained" onClick={() => open()}>
                {translate('Cadastrar')}
              </Button>
            )}
        </Stack>
      </Stack>
      <Typography color="text.secondary">
        {translate(
          'Organize a vida de A Ponte e acompanhe cada atividade. O acesso respeita suas responsabilidades.',
        )}
      </Typography>
      {resource === 'notifications' && (
        <Alert severity="info">
          {translate(
            'As mensagens internas ficam na caixa do destinatário e também geram um alerta nos dispositivos em que ele ativou as notificações. No canal E-mail, cada destinatário recebe uma mensagem no endereço cadastrado. O estado Enviado indica que o provedor aceitou o envio.',
          )}
        </Alert>
      )}
      {notice && (
        <Alert severity={notice.severity} onClose={() => setNotice(undefined)}>
          {notice.text}
        </Alert>
      )}
      {action.isError && <Alert severity="error">{action.error.message}</Alert>}
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2} flexWrap="wrap">
        <TextField
          label={translate('Pesquisar por nome')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        {c.statuses && (
          <TextField
            select
            label={translate('Situação')}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">{translate('Todas')}</MenuItem>
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
            label={translate('Atividade')}
            value={active}
            onChange={(e) => {
              setActive(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">{translate('Todos')}</MenuItem>
            <MenuItem value="true">{translate('Ativos')}</MenuItem>
            <MenuItem value="false">{translate('Inativos')}</MenuItem>
          </TextField>
        ) : (
          <>
            <TextField
              type="date"
              label={translate('De')}
              slotProps={{ inputLabel: { shrink: true } }}
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setPage(0);
              }}
            />
            <TextField
              type="date"
              label={translate('Até')}
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
            label={translate('Dia')}
            value={meetingDay}
            onChange={(e) => {
              setMeetingDay(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">{translate('Todos')}</MenuItem>
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
          {translate('Limpar filtros')}
        </Button>
      </Stack>
      {!!filterFields.length && (
        <details>
          <summary>{translate('Filtros por pessoa e atividade')}</summary>
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
          aria-label={translate('Carregando registros')}
        />
      )}
      {data.isError && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void data.refetch()}>
              {translate('Tentar novamente')}
            </Button>
          }
        >
          {data.error.message}
        </Alert>
      )}
      {data.data?.items.length === 0 && (
        <Alert severity="info">
          {translate(
            'Nenhum registro encontrado. Ajuste os filtros ou cadastre o primeiro.',
          )}
        </Alert>
      )}
      <RecordTable
        primaryLabel={translate('Nome')}
        label={c.title}
        summaryLabel={translate('Situação')}
      >
        {data.data?.items.map((e) => (
          <RecordRow
            key={e.id}
            primary={
              <>
                <Typography variant="h6">{entryName(e)}</Typography>
              </>
            }
            actions={
              <>
                {!['notifications', 'notification-templates'].includes(
                  resource,
                ) && (
                  <Button onClick={() => setDetail(e)}>
                    {translate('Detalhes')}
                  </Button>
                )}
                {(canUpdate ||
                  (resource === 'schedules' && e.canManage === true)) &&
                  (resource !== 'ministries' || ministryAdmin) &&
                  e.canManage !== false &&
                  !['notifications'].includes(resource) && (
                    <Button onClick={() => open(e)}>
                      {translate('Editar')}
                    </Button>
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
                        {translate('Enviar')}
                      </Button>
                      <Button
                        color="error"
                        onClick={() =>
                          setConfirm({
                            path: `/operations/notifications/${e.id}/cancel`,
                            text: translate('Cancelar notificação?'),
                          })
                        }
                      >
                        {translate('Cancelar')}
                      </Button>
                    </>
                  )}
              </>
            }
            summary={
              <>
                {typeof e.status === 'string' && (
                  <StatusChip status={e.status} />
                )}
              </>
            }
          >
            <Typography variant="body2">
              {e.active === true
                ? translate('Ativo')
                : e.active === false
                  ? translate('Inativo')
                  : ''}
            </Typography>
            {[
              'visitedAt',
              'nextContactAt',
              'startsAt',
              'date',
              'scheduledAt',
            ].map((k) =>
              e[k] && !(resource === 'ministries' && k === 'leader') ? (
                <Typography key={k} variant="body2">
                  {
                    (
                      {
                        visitedAt: translate('Primeira visita'),
                        nextContactAt: translate('Próximo contato'),
                        startsAt: translate('Início'),
                        date: translate('Data'),
                        scheduledAt: translate('Agendamento'),
                      } as Record<string, string>
                    )[k]
                  }
                  : {formatDateTime(String(e[k]))}
                </Typography>
              ) : null,
            )}
            {resource === 'ministries' && (
              <Typography variant="body2">
                {translate('Líderes:')}{' '}
                {Array.from(
                  new Set([
                    ...(e.leader ? [entryName(e.leader as Entry)] : []),
                    ...(
                      (e.members as { member: Entry }[] | undefined) ?? []
                    ).map((m) => entryName(m.member)),
                  ]),
                ).join(', ')}
              </Typography>
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
                        leader: translate('Líder'),
                        assignedTo: translate('Responsável'),
                        event: translate('Evento'),
                        ministry: translate('Ministério'),
                        smallGroup: translate('Grupo familiar'),
                        recipientMember: translate('Membro'),
                        recipientVisitor: translate('Visitante'),
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
      {form && (
        <OperationForm
          key={form.path}
          {...form}
          onClose={() => setForm(undefined)}
          onSaved={(result) => {
            setForm(undefined);
            const status = (result as Entry | undefined)?.status;
            const batch = result as
              | {
                  total?: number;
                  sent?: number;
                  failed?: number;
                  pending?: number;
                }
              | undefined;
            setNotice({
              text:
                resource !== 'notifications'
                  ? translate('Cadastro salvo com sucesso.')
                  : batch?.total !== undefined
                    ? translate(
                        'Destinatários: {0}. Enviadas: {1}. Falhas: {2}. Pendentes: {3}.',
                        [batch.total, batch.sent, batch.failed, batch.pending],
                      )
                    : status === 'SENT'
                      ? translate('Notificação enviada.')
                      : status === 'FAILED'
                        ? translate(
                            'Não foi possível enviar a notificação. Consulte a situação do envio.',
                          )
                        : translate('Notificação salva. Entrega pendente.'),
              severity:
                resource === 'notifications' &&
                (status === 'FAILED' || status === 'PARTIAL')
                  ? status === 'PARTIAL'
                    ? 'warning'
                    : 'error'
                  : 'success',
            });
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
        <DialogContent>
          {translate('O histórico será preservado.')}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(undefined)}>
            {translate('Voltar')}
          </Button>
          <Button
            color="error"
            disabled={action.isPending}
            onClick={() => confirm && action.mutate(confirm.path)}
          >
            {translate('Confirmar')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
