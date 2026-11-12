import { t as translate, useLocale } from '../../i18n';
import { LocalizedTextField as TextField } from '../../components/LocalizedTextField';
import { RecordTable, RecordRow } from '../../components/RecordTable';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, MenuItem, Stack, Typography } from '@mui/material';
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
    get label() {
      return translate('Inscrições');
    },
    permission: 'EVENT_REGISTRATION_READ',
  },
  {
    key: 'tickets',
    get label() {
      return translate('Ingressos e lotes');
    },
    permission: 'EVENT_TICKET_MANAGE',
  },
  {
    key: 'coupons',
    get label() {
      return translate('Cupões e cortesias');
    },
    permission: 'EVENT_COUPON_MANAGE',
  },
  {
    key: 'payments',
    get label() {
      return translate('Pagamentos');
    },
    permission: 'EVENT_PAYMENT_READ',
  },
  {
    key: 'refunds',
    get label() {
      return translate('Reembolsos');
    },
    permission: 'EVENT_PAYMENT_READ',
  },
  {
    key: 'checkin',
    get label() {
      return translate('Credenciamento');
    },
    permission: 'EVENT_CHECKIN',
  },
  {
    key: 'sessions',
    get label() {
      return translate('Sessões');
    },
    permission: 'EVENT_ATTENDEE_READ',
  },
  {
    key: 'notifications',
    get label() {
      return translate('Comunicação');
    },
    permission: 'EVENT_NOTIFICATION_SEND',
  },
  {
    key: 'reports',
    get label() {
      return translate('Relatórios');
    },
    permission: 'EVENT_REPORT_READ',
  },
  {
    key: 'managers',
    get label() {
      return translate('Gestores');
    },
    permission: 'EVENT_MANAGER_ASSIGN',
  },
];
const fields: Record<string, Field[]> = {
  registrations: [
    {
      key: 'memberId',
      get label() {
        return translate('Membro');
      },
      lookup: 'people',
    },
    {
      key: 'visitorId',
      get label() {
        return translate('ID de visitante existente (opcional)');
      },
    },
    {
      key: 'name',
      get label() {
        return translate('Nome do novo visitante');
      },
    },
    {
      key: 'email',
      get label() {
        return translate('Email do novo visitante');
      },
    },
    {
      key: 'phone',
      get label() {
        return translate('Telefone do novo visitante');
      },
    },
    {
      key: 'communicationConsent',
      get label() {
        return translate('Receber comunicações do evento');
      },
      type: 'boolean',
    },
  ],
  tickets: [
    {
      key: 'name',
      get label() {
        return translate('Nome do ingresso / lote');
      },
      required: true,
    },
    {
      key: 'price',
      get label() {
        return translate('Preço');
      },
      type: 'number',
      required: true,
    },
    {
      key: 'capacity',
      get label() {
        return translate('Quantidade');
      },
      type: 'number',
      required: true,
    },
    {
      key: 'startsAt',
      get label() {
        return translate('Início das vendas');
      },
      type: 'datetime-local',
      required: true,
    },
    {
      key: 'endsAt',
      get label() {
        return translate('Fim das vendas');
      },
      type: 'datetime-local',
      required: true,
    },
  ],
  coupons: [
    {
      key: 'code',
      get label() {
        return translate('Código');
      },
      required: true,
    },
    {
      key: 'discountPercent',
      get label() {
        return translate('Desconto (%) — 100 para cortesia');
      },
      type: 'number',
      required: true,
    },
  ],
  sessions: [
    {
      key: 'name',
      get label() {
        return translate('Nome');
      },
      required: true,
    },
    {
      key: 'startsAt',
      get label() {
        return translate('Início');
      },
      type: 'datetime-local',
      required: true,
    },
    {
      key: 'endsAt',
      get label() {
        return translate('Fim');
      },
      type: 'datetime-local',
      required: true,
    },
  ],
  checkin: [
    {
      key: 'qrToken',
      get label() {
        return translate('Código QR da inscrição');
      },
      required: true,
    },
    {
      key: 'sessionId',
      get label() {
        return translate('ID da sessão (opcional)');
      },
    },
  ],
  notifications: [
    {
      key: 'subject',
      get label() {
        return translate('Assunto');
      },
      required: true,
    },
    {
      key: 'content',
      get label() {
        return translate('Mensagem aos inscritos');
      },
      type: 'textarea',
      required: true,
    },
  ],
  managers: [
    {
      key: 'userId',
      get label() {
        return translate('ID do utilizador');
      },
      required: true,
    },
  ],
};
export function EventWorkspace() {
  useLocale();
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
        title: translate('Criar evento'),
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
      setNotice(translate('Operação concluída.'));
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
                label: translate('Lote de ingresso'),
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
    return (
      <Alert severity="warning">
        {translate('Sem permissão para eventos.')}
      </Alert>
    );
  return (
    <Stack spacing={2}>
      <Typography variant="h4">{translate('Gestão de eventos')}</Typography>
      {notice && (
        <Alert onClose={() => setNotice('')}>{translate(notice ?? '')}</Alert>
      )}
      {checkoutUrl && (
        <Alert severity="info">
          <Typography>
            {translate(
              'Encaminhe este link à pessoa para concluir o pagamento:',
            )}
          </Typography>
          <Button href={checkoutUrl} target="_blank">
            {translate('Abrir pagamento')}
          </Button>
          <TextField
            fullWidth
            label={translate('Link de pagamento')}
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
                title: translate('Criar evento'),
                path: '/events',
                fields: configs.events.fields.filter(
                  (f) => !['ministryId', 'smallGroupId'].includes(f.key),
                ),
              })
            }
          >
            {translate('Criar evento')}
          </Button>
        )}
        {id && hasPermission('EVENT_PUBLISH') && (
          <Button onClick={() => action.mutate(`/events/${id}/publish`)}>
            {translate('Publicar')}
          </Button>
        )}
        {id && hasPermission('EVENT_UPDATE') && (
          <Button
            onClick={() => {
              const row = events.data?.items.find((e) => e.id === id);
              setForm({
                title: translate('Editar evento'),
                path: `/events/${id}`,
                method: 'PATCH',
                initial: row,
                fields: configs.events.fields.filter(
                  (f) => !['ministryId', 'smallGroupId'].includes(f.key),
                ),
              });
            }}
          >
            {translate('Editar evento')}
          </Button>
        )}
      </Stack>
      {id && (
        <Alert severity="info">
          <Stack spacing={1}>
            <Typography>
              {translate(
                'URL pública de inscrição (disponível após publicar o evento)',
              )}
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
                  setNotice(translate('Link copiado.'));
                } catch {
                  setNotice(translate('Copie o link acima.'));
                }
              }}
            >
              {translate('Copiar link')}
            </Button>
          </Stack>
        </Alert>
      )}
      {section === 'registrations' && id && (
        <Alert severity="info">
          {translate(
            'Selecione um membro ou visitante existente, ou preencha nome, telefone e email para cadastrar um novo visitante. Para evento pago, selecione o lote e encaminhe o link de pagamento.',
          )}
        </Alert>
      )}
      <TextField
        select
        label={translate('Evento')}
        value={id}
        onChange={(e) => {
          setPage(1);
          setParams({ event: e.target.value, section });
        }}
      >
        <MenuItem value="">{translate('Selecione um evento')}</MenuItem>
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
          {translate('Selecione um evento para gerir as operações.')}
        </Alert>
      )}
      {id && allowed && (
        <>
          {createPermission[section] &&
            hasPermission(createPermission[section]) && (
              <Button onClick={() => open(section)}>
                {section === 'notifications'
                  ? translate('Enviar aos inscritos')
                  : section === 'checkin'
                    ? translate('Registrar entrada')
                    : translate('Adicionar')}
              </Button>
            )}
          {section === 'checkin' && hasPermission('EVENT_CHECKIN_REVERSE') && (
            <Button onClick={() => open('checkin', 'checkin/reverse')}>
              {translate('Reverter entrada')}
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
                        e instanceof Error
                          ? e.message
                          : translate('Falha na exportação'),
                      );
                    }
                  }}
                >
                  {translate('Exportar relatório')}
                </Button>
              )}
            </>
          )}
          {listable &&
            section !== 'reports' &&
            rows.length === 0 &&
            !data.isPending && (
              <Typography>{translate('Sem registos.')}</Typography>
            )}
          <RecordTable>
            {rows.map((row) => (
              <RecordRow
                key={row.id}
                primary={
                  <>
                    <Typography>
                      {String(
                        row.name ??
                          row.code ??
                          (row.member as { name?: string } | undefined)?.name ??
                          (row.visitor as { name?: string } | undefined)
                            ?.name ??
                          row.id,
                      )}
                    </Typography>
                  </>
                }
                actions={
                  <>
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
                          {translate('Aprovar inscrição')}
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
                          {translate('Cancelar inscrição')}
                        </Button>
                      )}
                    {section === 'tickets' && (
                      <Button
                        onClick={() =>
                          open('tickets', `tickets/${row.id}`, row, 'PATCH')
                        }
                      >
                        {translate('Editar lote e preço')}
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
                          {translate('Aprovar reembolso')}
                        </Button>
                      )}
                    {section === 'payments' &&
                      row.status === 'CONFIRMED' &&
                      hasPermission('EVENT_REGISTRATION_MANAGE') && (
                        <Button
                          onClick={() =>
                            setForm({
                              title: translate('Solicitar reembolso'),
                              path: `/events/${id}/payments/${row.id}/refunds`,
                              fields: [
                                {
                                  key: 'reason',
                                  label: translate('Motivo'),
                                  type: 'textarea',
                                  required: true,
                                },
                              ],
                            })
                          }
                        >
                          {translate('Solicitar reembolso')}
                        </Button>
                      )}
                    {section === 'managers' && row.revokedAt == null && (
                      <Button
                        onClick={() =>
                          setForm({
                            title: translate('Revogar gestor'),
                            path: `/events/${id}/managers/revoke`,
                            fields: fields.managers!,
                            initial: row,
                          })
                        }
                      >
                        {translate('Revogar atribuição')}
                      </Button>
                    )}
                  </>
                }
              >
                <Typography variant="body2">
                  {Object.entries(row)
                    .filter(
                      ([key, v]) =>
                        !['id', 'qrToken', 'member', 'visitor'].includes(key) &&
                        v !== null &&
                        typeof v !== 'object',
                    )
                    .map(([key, v]) => `${key}: ${String(v)}`)
                    .join(' · ')}
                </Typography>
                {row.qrToken != null && hasPermission('EVENT_CHECKIN') && (
                  <RegistrationQr token={String(row.qrToken)} />
                )}
              </RecordRow>
            ))}
          </RecordTable>
          {listable && !['reports', 'managers'].includes(section) && (
            <Stack direction="row">
              <Button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {translate('Anterior')}
              </Button>
              <Typography>
                {translate('Página ')}
                {page}
              </Typography>
              <Button
                disabled={rows.length < 20}
                onClick={() => setPage((p) => p + 1)}
              >
                {translate('Seguinte')}
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
            setNotice(translate('Operação concluída.'));
            void client.invalidateQueries({ queryKey: ['event-workspace'] });
            void client.invalidateQueries({ queryKey: ['managed-events'] });
          }}
        />
      )}
    </Stack>
  );
}
