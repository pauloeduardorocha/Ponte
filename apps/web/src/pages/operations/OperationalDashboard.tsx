import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { apiRequest } from '../../lib/api';
import { BreakdownChart, MetricCard } from '../../components/DataPresentation';
import { entryName, operationLabels, type Entry } from './operation-config';
type Dashboard = {
  scheduleConflicts?: number;
  visitors?: number;
  newVisitors?: number;
  integrating?: number;
  pendingFollowUps?: number;
  activeFollowUps?: number;
  overdueContacts?: number;
  completedFollowUps?: number;
  activeGroups?: number;
  groupParticipants?: number;
  activeMinistries?: number;
  activeVolunteers?: number;
  nextContacts?: Entry[];
  upcomingEvents?: Entry[];
  upcomingSchedules?: Entry[];
  recentAttendance?: Entry[];
  attendanceSummary?: { status: string; _count: { _all: number } }[];
};
export function OperationalDashboard() {
  const { user } = useAuth(),
    [start, setStart] = useState(''),
    [end, setEnd] = useState('');
  const enabled =
    user?.permissions.some((p) =>
      [
        'VISITOR_READ',
        'FOLLOWUP_READ',
        'SMALL_GROUP_READ',
        'MINISTRY_READ',
        'EVENT_READ',
        'SCHEDULE_READ',
        'ATTENDANCE_READ',
      ].includes(p),
    ) ?? false;
  const data = useQuery({
    queryKey: ['operations', 'dashboard', start, end],
    queryFn: () =>
      apiRequest<Dashboard>('/operations/dashboard', { query: { start, end } }),
    enabled,
    staleTime: 30000,
  });
  if (!enabled) return null;
  const metrics: [keyof Dashboard, string, string][] = [
    ['visitors', 'Visitantes no período', '/visitors'],
    ['newVisitors', 'Novos visitantes', '/visitors?status=NEW'],
    ['pendingFollowUps', 'Aguardando contato', '/follow-ups?status=PENDING'],
    ['overdueContacts', 'Contatos atrasados', '/follow-ups'],
    [
      'activeFollowUps',
      'Acompanhamentos em andamento',
      '/follow-ups?status=IN_PROGRESS',
    ],
    [
      'completedFollowUps',
      'Acompanhamentos concluídos',
      '/follow-ups?status=COMPLETED',
    ],
    ['integrating', 'Pessoas em integração', '/visitors?status=INTEGRATING'],
    ['scheduleConflicts', 'Conflitos de escala', '/schedules'],
    ['activeGroups', 'Grupos familiares ativas', '/small-groups'],
    ['groupParticipants', 'Participantes em grupos familiares', '/small-groups'],
    ['activeMinistries', 'Ministérios ativos', '/ministries'],
    ['activeVolunteers', 'Voluntários ativos', '/ministries'],
  ];
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Vida da igreja</Typography>
      <Stack direction="row" gap={2} flexWrap="wrap">
        <TextField
          label="Período: de"
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <TextField
          label="Período: até"
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
        <Button
          onClick={() => {
            setStart('');
            setEnd('');
          }}
        >
          Todo o período
        </Button>
      </Stack>
      {data.isPending && <Skeleton height={180} />}
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
      {data.data && (
        <>
          <div className="metric-grid">
            {metrics.map(([key, label, to]) =>
              typeof data.data?.[key] === 'number' ? (
                <MetricCard
                  key={key}
                  label={label}
                  value={String(data.data[key])}
                  href={to}
                />
              ) : null,
            )}
          </div>
          {!!data.data.attendanceSummary?.length && (
            <BreakdownChart
              title="Frequência no período"
              items={data.data.attendanceSummary.map((s) => ({
                label: operationLabels[s.status] ?? s.status,
                value: s._count._all,
                color:
                  s.status === 'PRESENT'
                    ? '#245b4a'
                    : s.status === 'ABSENT'
                      ? '#b53b36'
                      : '#b57b18',
              }))}
            />
          )}
          {(
            [
              'nextContacts',
              'upcomingEvents',
              'upcomingSchedules',
              'recentAttendance',
            ] as const
          ).map(
            (k) =>
              data.data?.[k] && (
                <Card variant="outlined" key={k}>
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="h6">
                        {
                          {
                            nextContacts: 'Próximos contatos',
                            upcomingEvents: 'Próximos eventos',
                            upcomingSchedules: 'Próximas escalas',
                            recentAttendance: 'Presença recente',
                          }[k]
                        }
                      </Typography>
                      {data.data[k]!.length ? (
                        data.data[k]!.map((e) => (
                          <Typography key={e.id}>
                            {entryName(e)} ·{' '}
                            {String(
                              e.nextContactAt ??
                                e.startsAt ??
                                e.date ??
                                e.attendanceDate ??
                                'Sem data',
                            )
                              .slice(0, 16)
                              .replace('T', ' ')}
                          </Typography>
                        ))
                      ) : (
                        <Typography color="text.secondary">
                          Nenhum registro.
                        </Typography>
                      )}
                      <Button
                        component={Link}
                        to={
                          {
                            nextContacts: '/follow-ups',
                            upcomingEvents: '/events',
                            upcomingSchedules: '/schedules',
                            recentAttendance: '/attendance',
                          }[k]
                        }
                      >
                        Ver lista
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              ),
          )}
        </>
      )}
    </Stack>
  );
}
