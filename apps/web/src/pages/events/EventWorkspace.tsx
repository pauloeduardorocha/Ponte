import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { apiRequest } from '../../lib/api';
import { OperationForm } from '../operations/OperationForm';
import {
  configs,
  type Entry,
  type Field,
} from '../operations/operation-config';
import type { Permission } from '@church/shared';
import { RegistrationQr } from './RegistrationQr';
import { EventReport } from './EventReport';

const sections: { key: string; label: string; permission: Permission }[] = [
  {
    key: 'registrations',
    label: 'Inscrições',
    permission: 'EVENT_REGISTRATION_READ',
  },
  {
    key: 'tickets',
    label: 'Ingressos e lotes',
    permission: 'EVENT_TICKET_MANAGE',
  },
  {
    key: 'coupons',
    label: 'Cupões e cortesias',
    permission: 'EVENT_COUPON_MANAGE',
  },
  { key: 'payments', label: 'Pagamentos', permission: 'EVENT_PAYMENT_READ' },
  { key: 'refunds', label: 'Reembolsos', permission: 'EVENT_PAYMENT_READ' },
  { key: 'checkin', label: 'Credenciamento', permission: 'EVENT_CHECKIN' },
  { key: 'sessions', label: 'Sessões', permission: 'EVENT_ATTENDEE_READ' },
  {
    key: 'notifications',
    label: 'Comunicação',
    permission: 'EVENT_NOTIFICATION_SEND',
  },
  { key: 'reports', label: 'Relatórios', permission: 'EVENT_REPORT_READ' },
  { key: 'managers', label: 'Gestores', permission: 'EVENT_MANAGER_ASSIGN' },
];
const fields: Record<string, Field[]> = {
  registrations: [
    { key: 'memberId', label: 'Membro', lookup: 'people' },
    { key: 'visitorId', label: 'ID de visitante existente (opcional)' },
    { key: 'name', label: 'Nome do novo visitante' },
    { key: 'email', label: 'Email do novo visitante' },
    { key: 'phone', label: 'Telefone do novo visitante' },
    {
      key: 'communicationConsent',
      label: 'Receber comunicações do evento',
      type: 'boolean',
    },
  ],
  tickets: [
    { key: 'name', label: 'Nome do ingresso / lote', required: true },
    { key: 'price', label: 'Preço', type: 'number', required: true },
    { key: 'capacity', label: 'Quantidade', type: 'number', required: true },
    {
      key: 'startsAt',
      label: 'Início das vendas',
      type: 'datetime-local',
      required: true,
    },
    {
      key: 'endsAt',
      label: 'Fim das vendas',
      type: 'datetime-local',
      required: true,
    },
  ],
  coupons: [
    { key: 'code', label: 'Código', required: true },
    {
      key: 'discountPercent',
      label: 'Desconto (%) — 100 para cortesia',
      type: 'number',
      required: true,
    },
  ],
  sessions: [
    { key: 'name', label: 'Nome', required: true },
    {
      key: 'startsAt',
      label: 'Início',
      type: 'datetime-local',
      required: true,
    },
    { key: 'endsAt', label: 'Fim', type: 'datetime-local', required: true },
  ],
  checkin: [
    { key: 'qrToken', label: 'Código QR da inscrição', required: true },
    { key: 'sessionId', label: 'ID da sessão (opcional)' },
  ],
  notifications: [
    { key: 'subject', label: 'Assunto', required: true },
    {
      key: 'content',
      label: 'Mensagem aos inscritos',
      type: 'textarea',
      required: true,
    },
  ],
  managers: [{ key: 'userId', label: 'ID do utilizador', required: true }],
};
export function EventWorkspace() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const id = params.get('event') ?? '',
    section =
      params.get('section') === 'attendees'
        ? 'registrations'
        : (params.get('section') ?? 'registrations');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{
    path: string;
    fields: Field[];
    title: string;
    method?: 'POST' | 'PATCH';
    initial?: Entry;
  }>();
  const [notice, setNotice] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  useEffect(() => {
    if (params.get('create') === 'true' && hasPermission('EVENT_CREATE')) {
      setForm({
        title: 'Criar evento',
        path: '/events',
        fields: configs.events.fields.filter(
          (f) => !['ministryId', 'smallGroupId'].includes(f.key),
        ),
      });
      const next = new URLSearchParams(params);
      next.delete('create');
      setParams(next, { replace: true });
    }
  }, [params, hasPermission, setParams]);
  const client = useQueryClient();
  const events = useQuery({
    queryKey: ['managed-events'],
    queryFn: () =>
      apiRequest<{ items: Entry[]; total: number }>('/events', {
        query: { pageSize: 100 },
      }),
    enabled: hasPermission('EVENT_READ'),
  });
  const lots = useQuery({
    queryKey: ['registration-lots', id],
    queryFn: () => apiRequest<Entry[]>(`/events/${id}/registration-lots`),
    enabled: !!id && hasPermission('EVENT_REGISTRATION_MANAGE'),
  });
  const active = sections.find((s) => s.key === section);
  const allowed = !!active && hasPermission(active.permission);
  const listable = !['checkin', 'notifications'].includes(section);
  const data = useQuery({
    queryKey: ['event-workspace', id, section, page],
    queryFn: () =>
      apiRequest<unknown>(`/events/${id}/${section}`, {
        query: { page, pageSize: 20 },
      }),
    enabled: !!id && allowed && listable,
  });
  const action = useMutation({
    mutationFn: (path: string) => apiRequest(path, { method: 'POST' }),
    onSuccess: () => {
      setNotice('Operação concluída.');
      void client.invalidateQueries({ queryKey: ['event-workspace'] });
    },
    onError: (e) => setNotice(e.message),
  });
  function open(
    key: string,
    suffix = key,
    initial?: Entry,
    method?: 'POST' | 'PATCH',
  ) {
    setForm({
      path: `/events/${id}/${suffix}`,
      fields:
        key === 'registrations'
          ? [
              ...fields.registrations!,
              {
                key: 'ticketId',
                label: 'Lote de ingresso',
                options: lots.data?.map((t) => String(t.id)),
                optionLabels: Object.fromEntries(
                  (lots.data ?? []).map((t) => [
                    String(t.id),
                    `${String(t.name)} · €${String(t.price)}`,
                  ]),
                ),
              },
            ]
          : (fields[key] ?? []),
      title: active?.label ?? key,
      initial,
      method,
    });
  }
  const rows = Array.isArray(data.data)
    ? (data.data as Entry[])
    : ((data.data as { items?: Entry[] } | undefined)?.items ?? []);
  const createPermission: Record<string, Permission> = {
    registrations: 'EVENT_REGISTRATION_MANAGE',
    tickets: 'EVENT_TICKET_MANAGE',
    coupons: 'EVENT_COUPON_MANAGE',
    sessions: 'EVENT_ATTENDEE_MANAGE',
    checkin: 'EVENT_CHECKIN',
    notifications: 'EVENT_NOTIFICATION_SEND',
    managers: 'EVENT_MANAGER_ASSIGN',
  };
  if (!hasPermission('EVENT_READ'))
    return <Alert severity="warning">Sem permissão para eventos.</Alert>;
  return (
    <Stack spacing={2}>
      <Typography variant="h4">Meus eventos</Typography>
      {notice && <Alert onClose={() => setNotice('')}>{notice}</Alert>}
      {checkoutUrl && (
        <Alert severity="info">
          <Typography>
            Encaminhe este link à pessoa para concluir o pagamento:
          </Typography>
          <Button href={checkoutUrl} target="_blank">
            Abrir pagamento
          </Button>
          <TextField
            fullWidth
            label="Link de pagamento"
            value={checkoutUrl}
            slotProps={{ input: { readOnly: true } }}
          />
        </Alert>
      )}
      {events.isError && <Alert severity="error">{events.error.message}</Alert>}
      <Stack direction="row" spacing={1}>
        {hasPermission('EVENT_CREATE') && (
          <Button
            onClick={() =>
              setForm({
                title: 'Criar evento',
                path: '/events',
                fields: configs.events.fields.filter(
                  (f) => !['ministryId', 'smallGroupId'].includes(f.key),
                ),
              })
            }
          >
            Criar evento
          </Button>
        )}
        {id && hasPermission('EVENT_PUBLISH') && (
          <Button onClick={() => action.mutate(`/events/${id}/publish`)}>
            Publicar
          </Button>
        )}
        {id && hasPermission('EVENT_UPDATE') && (
          <Button
            onClick={() => {
              const row = events.data?.items.find((e) => e.id === id);
              setForm({
                title: 'Editar evento',
                path: `/events/${id}`,
                method: 'PATCH',
                initial: row,
                fields: configs.events.fields.filter(
                  (f) => !['ministryId', 'smallGroupId'].includes(f.key),
                ),
              });
            }}
          >
            Editar evento
          </Button>
        )}
      </Stack>
      {id && (
        <Alert severity="info">
          <Stack spacing={1}>
            <Typography>
              URL pública de inscrição (disponível após publicar o evento)
            </Typography>
            <Button
              href={`/events/${id}/register`}
              target="_blank"
            >{`${window.location.origin}/events/${id}/register`}</Button>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}/events/${id}/register`,
                  );
                  setNotice('Link copiado.');
                } catch {
                  setNotice('Copie o link acima.');
                }
              }}
            >
              Copiar link
            </Button>
          </Stack>
        </Alert>
      )}
      {section === 'registrations' && id && (
        <Alert severity="info">
          Selecione um membro ou visitante existente, ou preencha nome, telefone
          e email para cadastrar um novo visitante. Para evento pago, selecione
          o lote e encaminhe o link de pagamento.
        </Alert>
      )}
      <TextField
        select
        label="Evento"
        value={id}
        onChange={(e) => {
          setPage(1);
          setParams({ event: e.target.value, section });
        }}
      >
        <MenuItem value="">Selecione um evento</MenuItem>
        {events.data?.items.map((e) => (
          <MenuItem key={e.id} value={e.id}>
            {String(e.title ?? e.name)}
          </MenuItem>
        ))}
      </TextField>
      <Stack direction="row" gap={1} flexWrap="wrap">
        {sections
          .filter((s) => hasPermission(s.permission))
          .map((s) => (
            <Button
              key={s.key}
              variant={s.key === section ? 'contained' : 'text'}
              onClick={() => {
                setPage(1);
                setParams({ event: id, section: s.key });
              }}
            >
              {s.label}
            </Button>
          ))}
      </Stack>
      {!id && (
        <Alert severity="info">
          Selecione um evento para gerir as operações.
        </Alert>
      )}
      {id && allowed && (
        <>
          {createPermission[section] &&
            hasPermission(createPermission[section]) && (
              <Button onClick={() => open(section)}>
                {section === 'notifications'
                  ? 'Enviar aos inscritos'
                  : section === 'checkin'
                    ? 'Registrar entrada'
                    : 'Adicionar'}
              </Button>
            )}
          {section === 'checkin' && hasPermission('EVENT_CHECKIN_REVERSE') && (
            <Button onClick={() => open('checkin', 'checkin/reverse')}>
              Reverter entrada
            </Button>
          )}
          {data.isError && <Alert severity="error">{data.error.message}</Alert>}
          {section === 'reports' && data.data != null && (
            <>
              <EventReport value={data.data} />
              {hasPermission('EVENT_REPORT_EXPORT') && (
                <Button
                  onClick={async () => {
                    try {
                      const report = await apiRequest(
                        `/events/${id}/reports/export`,
                      );
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(report, null, 2)], {
                          type: 'application/json',
                        }),
                      );
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `evento-${id}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch (e) {
                      setNotice(
                        e instanceof Error ? e.message : 'Falha na exportação',
                      );
                    }
                  }}
                >
                  Exportar relatório
                </Button>
              )}
            </>
          )}
          {listable &&
            section !== 'reports' &&
            rows.length === 0 &&
            !data.isPending && <Typography>Sem registos.</Typography>}
          {rows.map((row) => (
            <Card key={row.id}>
              <CardContent>
                <Stack spacing={1}>
                  <Typography>
                    {String(
                      row.name ??
                        row.code ??
                        (row.member as { name?: string } | undefined)?.name ??
                        (row.visitor as { name?: string } | undefined)?.name ??
                        row.id,
                    )}
                  </Typography>
                  <Typography variant="body2">
                    {Object.entries(row)
                      .filter(
                        ([key, v]) =>
                          !['id', 'qrToken', 'member', 'visitor'].includes(
                            key,
                          ) &&
                          v !== null &&
                          typeof v !== 'object',
                      )
                      .map(([key, v]) => `${key}: ${String(v)}`)
                      .join(' · ')}
                  </Typography>
                  {row.qrToken != null && hasPermission('EVENT_CHECKIN') && (
                    <RegistrationQr token={String(row.qrToken)} />
                  )}
                  {section === 'registrations' &&
                    hasPermission('EVENT_REGISTRATION_APPROVE') &&
                    row.status === 'REGISTERED' && (
                      <Button
                        onClick={() =>
                          action.mutate(
                            `/events/${id}/registrations/${row.id}/approve`,
                          )
                        }
                      >
                        Aprovar inscrição
                      </Button>
                    )}
                  {section === 'registrations' &&
                    hasPermission('EVENT_REGISTRATION_MANAGE') && (
                      <Button
                        onClick={() =>
                          action.mutate(
                            `/events/${id}/registrations/${row.id}/cancel`,
                          )
                        }
                      >
                        Cancelar inscrição
                      </Button>
                    )}
                  {section === 'tickets' && (
                    <Button
                      onClick={() =>
                        open('tickets', `tickets/${row.id}`, row, 'PATCH')
                      }
                    >
                      Editar lote e preço
                    </Button>
                  )}
                  {section === 'refunds' &&
                    row.status === 'REQUESTED' &&
                    hasPermission('EVENT_REFUND_APPROVE') && (
                      <Button
                        onClick={() =>
                          action.mutate(
                            `/events/${id}/refunds/${row.id}/approve`,
                          )
                        }
                      >
                        Aprovar reembolso
                      </Button>
                    )}
                  {section === 'payments' &&
                    row.status === 'CONFIRMED' &&
                    hasPermission('EVENT_REGISTRATION_MANAGE') && (
                      <Button
                        onClick={() =>
                          setForm({
                            title: 'Solicitar reembolso',
                            path: `/events/${id}/payments/${row.id}/refunds`,
                            fields: [
                              {
                                key: 'reason',
                                label: 'Motivo',
                                type: 'textarea',
                                required: true,
                              },
                            ],
                          })
                        }
                      >
                        Solicitar reembolso
                      </Button>
                    )}
                  {section === 'managers' && row.revokedAt == null && (
                    <Button
                      onClick={() =>
                        setForm({
                          title: 'Revogar gestor',
                          path: `/events/${id}/managers/revoke`,
                          fields: fields.managers!,
                          initial: row,
                        })
                      }
                    >
                      Revogar atribuição
                    </Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}
          {listable && !['reports', 'managers'].includes(section) && (
            <Stack direction="row">
              <Button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Typography>Página {page}</Typography>
              <Button
                disabled={rows.length < 20}
                onClick={() => setPage((p) => p + 1)}
              >
                Seguinte
              </Button>
            </Stack>
          )}
        </>
      )}
      {form && (
        <OperationForm
          {...form}
          onClose={() => setForm(undefined)}
          onSaved={(result) => {
            setCheckoutUrl(
              (result as { checkoutUrl?: string } | undefined)?.checkoutUrl ??
                '',
            );
            setForm(undefined);
            setNotice('Operação concluída.');
            void client.invalidateQueries({ queryKey: ['event-workspace'] });
            void client.invalidateQueries({ queryKey: ['managed-events'] });
          }}
        />
      )}
    </Stack>
  );
}
