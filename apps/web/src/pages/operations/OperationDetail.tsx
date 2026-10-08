import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  TablePagination,
  Typography,
} from '@mui/material';
import { useAuth } from '../../auth/auth-context';
import { apiRequest } from '../../lib/api';
import { StatusChip } from '../../components/DataPresentation';
import {
  configs,
  entryName,
  type Entry,
  type Field,
  type Resource,
} from './operation-config';
import { OperationForm } from './OperationForm';
export function OperationDetail({
  resource,
  entry,
  onClose,
}: {
  resource: Resource;
  entry: Entry;
  onClose: () => void;
}) {
  const { hasPermission } = useAuth(),
    client = useQueryClient();
  const [page, setPage] = useState(0),
    [notice, setNotice] = useState('');
  const [nested, setNested] = useState<Entry>();
  const [form, setForm] = useState<{
    title: string;
    path: string;
    fields: Field[];
    method?: 'POST' | 'PATCH';
    initial?: Entry;
  }>();
  const [confirm, setConfirm] = useState<{ path: string; label: string }>();
  const endpoint =
    resource === 'visitors'
      ? 'history'
      : resource === 'follow-ups'
        ? 'interactions'
        : ['ministries', 'small-groups'].includes(resource)
          ? 'participants'
          : resource === 'events'
            ? 'registrations'
            : 'assignments';
  const permitted = resource !== 'visitors' || hasPermission('FOLLOWUP_READ');
  const path = `/operations/${resource}/${entry.id}/${endpoint}`;
  const data = useQuery({
    queryKey: ['operations', 'detail', path, page],
    queryFn: () =>
      apiRequest<{ items: Entry[]; total: number }>(path, {
        query: { page: page + 1, pageSize: 20 },
      }),
    enabled: permitted,
  });
  const action = useMutation({
    mutationFn: (p: string) => apiRequest(p, { method: 'POST' }),
    onSuccess: () => {
      setConfirm(undefined);
      setNotice('Operação concluída.');
      void client.invalidateQueries({ queryKey: ['operations'] });
    },
  });
  const identity = useQuery({
    queryKey: ['operations', 'identity'],
    queryFn: () =>
      apiRequest<{ memberId: string | null }>('/operations/identity'),
    enabled: resource === 'schedules',
  });
  const canManage =
    hasPermission(configs[resource].update) ||
    (resource === 'events' && hasPermission('EVENT_REGISTRATION_MANAGE'));
  const member: Field = {
    key: 'memberId',
    label: 'Membro',
    lookup: 'people',
    required: true,
  };
  const person: Field[] = [
    { ...member, required: false },
    { key: 'visitorId', label: 'Visitante', lookup: 'visitors' },
  ];
  const assignmentFields: Field[] = [
    member,
    { key: 'function', label: 'Função', required: true },
    { key: 'ministryId', label: 'Ministério', lookup: 'ministries' },
    { key: 'notes', label: 'Observações', type: 'textarea' },
  ];
  return (
    <>
      <Dialog open fullWidth maxWidth="md" onClose={onClose}>
        <DialogTitle>
          {entryName(entry)} ·{' '}
          {endpoint === 'history'
            ? 'Histórico'
            : endpoint === 'interactions'
              ? 'Contatos'
              : endpoint === 'participants'
                ? 'Participantes'
                : endpoint === 'registrations'
                  ? 'Inscrições'
                  : 'Voluntários'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {notice && <Alert severity="success">{notice}</Alert>}
            {action.isError && (
              <Alert severity="error">{action.error.message}</Alert>
            )}
            {resource === 'visitors' && (
              <>
                <Typography>
                  Primeira visita:{' '}
                  {String(entry.visitedAt ?? entry.firstVisitDate).slice(0, 10)}
                </Typography>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  {hasPermission('FOLLOWUP_CREATE') &&
                    hasPermission('FOLLOWUP_READ') && (
                      <Button
                        onClick={() =>
                          setForm({
                            title: 'Iniciar acompanhamento',
                            path: '/operations/follow-ups',
                            fields: configs['follow-ups'].fields,
                            initial: {
                              id: entry.id,
                              visitorId: entry.id,
                              visitor: entry,
                            },
                          })
                        }
                      >
                        Iniciar acompanhamento
                      </Button>
                    )}
                  {!entry.memberId &&
                    hasPermission('VISITOR_UPDATE') &&
                    hasPermission('MEMBER_CREATE') && (
                      <Button
                        variant="contained"
                        onClick={() =>
                          setForm({
                            title: 'Converter visitante em membro',
                            path: `/operations/visitors/${entry.id}/convert`,
                            fields: [
                              {
                                key: 'memberId',
                                label: 'Vincular membro existente (opcional)',
                                lookup: 'people',
                              },
                            ],
                          })
                        }
                      >
                        Converter em membro
                      </Button>
                    )}
                  {!!entry.memberId && (
                    <Alert severity="info">
                      Convertido em membro. O histórico do visitante foi
                      preservado.
                    </Alert>
                  )}
                </Stack>
              </>
            )}
            {resource === 'follow-ups' && canManage && (
              <Button
                onClick={() =>
                  setForm({
                    title: 'Registrar contato',
                    path,
                    fields: [
                      {
                        key: 'type',
                        label: 'Canal',
                        options: [
                          'PHONE',
                          'WHATSAPP',
                          'EMAIL',
                          'IN_PERSON',
                          'OTHER',
                        ],
                        required: true,
                      },
                      {
                        key: 'interactionDate',
                        label: 'Data e hora',
                        type: 'datetime-local',
                        required: true,
                      },
                      {
                        key: 'notes',
                        label: 'Registro do contato',
                        type: 'textarea',
                        required: true,
                      },
                      {
                        key: 'nextActionAt',
                        label: 'Próxima ação',
                        type: 'datetime-local',
                      },
                    ],
                  })
                }
              >
                Registrar contato
              </Button>
            )}
            {['small-groups', 'ministries'].includes(resource) && canManage && (
              <Button
                onClick={() =>
                  setForm({
                    title: 'Adicionar participante',
                    path,
                    fields: [
                      member,
                      {
                        key: 'role',
                        label: 'Função',
                        options:
                          resource === 'ministries'
                            ? ['MEMBER', 'LEADER']
                            : ['MEMBER', 'LEADER', 'CO_LEADER', 'HOST'],
                      },
                    ],
                  })
                }
              >
                Adicionar participante
              </Button>
            )}
            {resource === 'events' && canManage && (
              <Button
                onClick={() =>
                  setForm({
                    title: 'Inscrever participante',
                    path,
                    fields: person,
                  })
                }
              >
                Inscrever participante
              </Button>
            )}
            {resource === 'schedules' && canManage && (
              <Button
                onClick={() =>
                  setForm({
                    title: 'Convidar voluntário',
                    path,
                    fields: assignmentFields,
                  })
                }
              >
                Convidar voluntário
              </Button>
            )}
            {data.isPending && permitted && (
              <Skeleton height={120} aria-label="Carregando histórico" />
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
              <Alert severity="info">Nenhum registro neste histórico.</Alert>
            )}
            {data.data?.items.map((row) => (
              <Stack
                key={row.id}
                spacing={1}
                sx={{
                  p: 2,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                }}
              >
                <Typography fontWeight={600}>{entryName(row)}</Typography>
                {typeof row.status === 'string' && (
                  <StatusChip status={row.status} />
                )}
                {[
                  'interactionDate',
                  'startedAt',
                  'joinedAt',
                  'leftAt',
                  'confirmedAt',
                ].map((k) =>
                  row[k] ? (
                    <Typography key={k} variant="body2">
                      {
                        (
                          {
                            interactionDate: 'Contato',
                            startedAt: 'Início',
                            joinedAt: 'Entrada',
                            leftAt: 'Saída',
                            confirmedAt: 'Confirmação',
                          } as Record<string, string>
                        )[k]
                      }
                      : {new Date(String(row[k])).toLocaleString('pt-PT')}
                    </Typography>
                  ) : null,
                )}
                {typeof row.role === 'string' && (
                  <StatusChip status={row.role} />
                )}
                {!!row.function && (
                  <Typography>Função: {String(row.function)}</Typography>
                )}
                {!!row.notes && (
                  <Typography sx={{ overflowWrap: 'anywhere' }}>
                    {String(row.notes)}
                  </Typography>
                )}
                {!!row.performedBy && (
                  <Typography variant="body2">
                    Registrado por: {entryName(row.performedBy as Entry)}
                  </Typography>
                )}
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {resource === 'schedules' &&
                    row.memberId === identity.data?.memberId &&
                    ['INVITED', 'CONFIRMED', 'DECLINED'].includes(
                      String(row.status),
                    ) && (
                      <Button
                        onClick={() =>
                          setForm({
                            title: 'Responder à convocação',
                            path: path + '/' + row.id + '/respond',
                            fields: [
                              {
                                key: 'status',
                                label: 'Minha resposta',
                                options: ['CONFIRMED', 'DECLINED'],
                                required: true,
                              },
                            ],
                          })
                        }
                      >
                        Minha resposta
                      </Button>
                    )}
                  {resource === 'visitors' && (
                    <Button onClick={() => setNested(row)}>Ver contatos</Button>
                  )}
                  {canManage &&
                    ['small-groups', 'ministries'].includes(resource) &&
                    row.active === true && (
                      <Button
                        color="warning"
                        onClick={() =>
                          setConfirm({
                            path: path + '/' + row.id + '/leave',
                            label: 'Registrar saída do participante?',
                          })
                        }
                      >
                        Registrar saída
                      </Button>
                    )}
                  {canManage &&
                    resource === 'events' &&
                    row.status === 'REGISTERED' && (
                      <Button
                        color="error"
                        onClick={() =>
                          setConfirm({
                            path: path + '/' + row.id + '/cancel',
                            label: 'Cancelar inscrição?',
                          })
                        }
                      >
                        Cancelar inscrição
                      </Button>
                    )}
                  {resource === 'events' &&
                    hasPermission('ATTENDANCE_MANAGE') && (
                      <Button
                        onClick={() =>
                          setForm({
                            title: 'Registrar presença no evento',
                            path: '/operations/attendance',
                            fields: [
                              ...person,
                              {
                                key: 'eventId',
                                label: 'Evento',
                                lookup: 'events',
                                required: true,
                              },
                              {
                                key: 'attendanceDate',
                                label: 'Data',
                                type: 'date',
                                required: true,
                              },
                              {
                                key: 'status',
                                label: 'Presença',
                                options: ['PRESENT', 'ABSENT', 'EXCUSED'],
                                required: true,
                              },
                            ],
                            initial: {
                              id: row.id,
                              memberId: row.memberId,
                              visitorId: row.visitorId,
                              eventId: entry.id,
                              event: entry,
                              member: row.member,
                              visitor: row.visitor,
                              attendanceDate: String(entry.startsAt).slice(
                                0,
                                10,
                              ),
                            },
                          })
                        }
                      >
                        Registrar presença
                      </Button>
                    )}
                  {resource === 'schedules' &&
                    canManage &&
                    row.status !== 'REPLACED' && (
                      <>
                        <Button
                          onClick={() =>
                            setForm({
                              title: 'Atualizar participação',
                              path: path + '/' + row.id,
                              method: 'PATCH',
                              fields: [
                                {
                                  key: 'status',
                                  label: 'Participação',
                                  options: [
                                    'CONFIRMED',
                                    'DECLINED',
                                    'COMPLETED',
                                    'ABSENT',
                                  ],
                                  required: true,
                                },
                              ],
                            })
                          }
                        >
                          Confirmar / recusar
                        </Button>
                        <Button
                          color="warning"
                          onClick={() =>
                            setForm({
                              title: 'Substituir voluntário',
                              path: path + '/' + row.id + '/replace',
                              fields: assignmentFields,
                            })
                          }
                        >
                          Substituir
                        </Button>
                      </>
                    )}
                </Stack>
              </Stack>
            ))}
            {data.data && (
              <TablePagination
                component="div"
                count={data.data.total}
                rowsPerPage={20}
                page={page}
                rowsPerPageOptions={[20]}
                onPageChange={(_, p) => setPage(p)}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Fechar</Button>
        </DialogActions>
      </Dialog>
      {form && (
        <OperationForm
          {...form}
          onClose={() => setForm(undefined)}
          onSaved={() => {
            setForm(undefined);
            setNotice('Operação registrada com sucesso.');
          }}
        />
      )}
      {nested && (
        <OperationDetail
          resource="follow-ups"
          entry={nested}
          onClose={() => setNested(undefined)}
        />
      )}
      <Dialog open={!!confirm} onClose={() => setConfirm(undefined)}>
        <DialogTitle>{confirm?.label}</DialogTitle>
        <DialogContent>O histórico será preservado.</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(undefined)}>Voltar</Button>
          <Button
            color="warning"
            disabled={action.isPending}
            onClick={() => confirm && action.mutate(confirm.path)}
          >
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
