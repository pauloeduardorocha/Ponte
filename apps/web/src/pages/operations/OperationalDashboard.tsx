import { LocalizedTextField as TextField } from '../../components/LocalizedTextField';
import { formatDateTime, last30Days } from '../../lib/format';
import { RecordTable, RecordRow } from '../../components/RecordTable';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { apiRequest } from '../../lib/api';
import { MetricCard } from '../../components/DataPresentation';
import { entryName, type Entry } from './operation-config';
type Dashboard = {
  activeMembers?: number;
  activeMembersWithoutGroup?: number;
  followedVisitors?: number;
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
};
export function OperationalDashboard() {
  const { user } = useAuth(),
    [period, setPeriod] = useState(last30Days);
  const { start, end } = period;
  const enabled =
    user?.permissions.some((p) =>
      [
        'MEMBER_READ',
        'VISITOR_READ',
        'FOLLOWUP_READ',
        'SMALL_GROUP_READ',
        'MINISTRY_READ',
        'EVENT_READ',
        'SCHEDULE_READ',
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
  const d = data.data;
  const metrics = [
    {
      key: 'activeMembers',
      label: 'Membros ativos',
      value: d?.activeMembers,
      to: '/members?status=ACTIVE',
    },
    {
      key: 'followedVisitors',
      label: 'Visitantes acompanhados/visitantes no período',
      value:
        typeof d?.followedVisitors === 'number' &&
        typeof d.visitors === 'number'
          ? `${d.followedVisitors}/${d.visitors}`
          : undefined,
      to: '/visitors',
    },
    {
      key: 'activeMembersWithoutGroup',
      label: 'Membros ativos sem grupo familiar',
      value: d?.activeMembersWithoutGroup,
    },
    {
      key: 'activeVolunteers',
      label: 'Voluntários/membros',
      value:
        typeof d?.activeVolunteers === 'number' &&
        typeof d.activeMembers === 'number'
          ? `${d.activeVolunteers}/${d.activeMembers}`
          : undefined,
      detail: `${d?.activeVolunteers} voluntários de ${d?.activeMembers} membros ativos`,
      to: '/ministries',
    },
    {
      key: 'integrating',
      label: 'Pessoas em integração',
      value: d?.integrating,
      to: '/visitors?status=INTEGRATING',
    },
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
          onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
        />
        <TextField
          label="Período: até"
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
          value={end}
          onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
        />
        <Button
          onClick={() => {
            setPeriod(last30Days());
          }}
        >
          Últimos 30 dias
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
            {metrics.map(({ key, label, value, detail, to }) =>
              value !== undefined ? (
                <MetricCard
                  key={key}
                  label={label}
                  value={value}
                  detail={detail}
                  href={to}
                />
              ) : null,
            )}
          </div>
          {(
            ['nextContacts', 'upcomingEvents', 'upcomingSchedules'] as const
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
                          }[k]
                        }
                      </Typography>
                      {data.data[k]!.length ? (
                        <RecordTable hasActions={false}>
                          {data.data[k]!.map((e) => (
                            <RecordRow
                              key={e.id}
                              hasActions={false}
                              primary={<Typography>{entryName(e)}</Typography>}
                            >
                              <Typography variant="body2">
                                {formatDateTime(
                                  String(
                                    e.nextContactAt ??
                                      e.startsAt ??
                                      e.date ??
                                      'Sem data',
                                  ),
                                )}
                              </Typography>
                            </RecordRow>
                          ))}
                        </RecordTable>
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
