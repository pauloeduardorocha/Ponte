import { formatDate, formatDateTime } from '../lib/format';
import { retryQuery } from '../lib/query-retry';
import { MemberDashboard } from './MemberDashboard';
import { BirthdaysCard } from '../components/BirthdaysCard';
import { YouTubeCarousel } from '../components/YouTubeCarousel';
import { RecordTable, RecordRow } from '../components/RecordTable';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { apiRequest, getHealth } from '../lib/api';
import { MetricCard, BreakdownChart } from '../components/DataPresentation';
import { LibraryDashboardPanel } from './library/LibraryDashboardPanel';
import { FinancialDashboardPanel } from './FinancialDashboardPanel';
import { OperationalDashboard } from './operations/OperationalDashboard';

type Counts = { status: string; _count: { _all: number } };
type Community = {
  members?: Counts[];
  visitors?: Counts[];
  events?: number;
  upcomingEvents?: {
    id: string;
    name: string;
    startsAt: string;
    location: string;
  }[];
};
export function DashboardPage() {
  const { user } = useAuth();
  if (user?.status === 'PENDING_APPROVAL')
    return (
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          Olá, {user.name}
        </Typography>
        <Alert severity="info">
          Sua conta está aguardando aprovação de um administrador ou pastor.
          Enquanto isso, você pode assistir aos vídeos da igreja e ver os
          aniversariantes.
        </Alert>
        <YouTubeCarousel />
        <BirthdaysCard />
      </Stack>
    );
  return <ApprovedDashboard />;
}

function ApprovedDashboard() {
  const { hasPermission, user } = useAuth();
  const canCommunity = ['MEMBER_READ', 'VISITOR_READ', 'EVENT_READ'].some((p) =>
    user?.permissions.some((code) => code === p),
  );
  const health = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    retry: retryQuery,
    staleTime: 60000,
  });
  const community = useQuery({
    queryKey: ['community', 'dashboard'],
    queryFn: () => apiRequest<Community>('/community/dashboard'),
    enabled: canCommunity,
  });
  const d = community.data;
  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="overline" color="primary.main">
          {formatDate(new Date().toISOString())}
        </Typography>
        <Typography variant="h4" component="h1">
          Bom dia, A Ponte
        </Typography>
        <Typography color="text.secondary">
          Olá, {user?.name}. Acompanhe os dados e acesse as listas pelo seu
          painel.
        </Typography>
      </Box>
      <YouTubeCarousel />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            lg: 'repeat(2, minmax(0, 1fr))',
          },
          gap: 3,
          alignItems: 'start',
          '& > *': { minWidth: 0, overflowWrap: 'anywhere' },
        }}
      >
        <BirthdaysCard />
        {hasPermission('COMMUNITY_READ') && <MemberDashboard />}
      </Box>
      <OperationalDashboard />
      {health.isError && (
        <Alert severity="warning">
          Não foi possível conectar à API. Tente novamente em instantes.
        </Alert>
      )}
      {canCommunity && community.isPending && (
        <Skeleton
          variant="rounded"
          height={140}
          aria-label="Carregando indicadores de A Ponte"
        />
      )}
      {community.isError && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void community.refetch()}>
              Tentar novamente
            </Button>
          }
        >
          Não foi possível carregar os indicadores de A Ponte.
        </Alert>
      )}
      {d && (
        <>
          <Box className="metric-grid">
            {d.members && (
              <MetricCard
                label="Membros ativos"
                value={
                  d.members.find((m) => m.status === 'ACTIVE')?._count._all ?? 0
                }
                detail={`${d.members.reduce((v, m) => v + m._count._all, 0)} membros cadastrados`}
                href="/members?status=ACTIVE"
              />
            )}
            {d.visitors && (
              <MetricCard
                label="Visitantes"
                value={d.visitors.reduce((v, m) => v + m._count._all, 0)}
                detail="Acolhimento e acompanhamento"
                color="info.main"
                href="/visitors"
              />
            )}
            {d.events !== undefined && (
              <MetricCard
                label="Próximos eventos"
                value={d.events}
                detail="Agenda de A Ponte"
                color="secondary.main"
                href="/events?status=SCHEDULED"
              />
            )}
          </Box>
          <Box className="dashboard-panels">
            {d.members && (
              <BreakdownChart
                title="Situação dos membros"
                items={[
                  {
                    label: 'Ativos',
                    value:
                      d.members.find((m) => m.status === 'ACTIVE')?._count
                        ._all ?? 0,
                    color: 'success.main',
                  },
                  {
                    label: 'Inativos',
                    value:
                      d.members.find((m) => m.status === 'INACTIVE')?._count
                        ._all ?? 0,
                    color: 'text.secondary',
                  },
                ]}
              />
            )}{' '}
            {d.visitors && (
              <BreakdownChart
                title="Acompanhamento de visitantes"
                items={[
                  {
                    label: 'Novos',
                    value:
                      d.visitors.find((v) => v.status === 'NEW')?._count._all ??
                      0,
                    color: 'warning.main',
                  },
                  {
                    label: 'Contactados',
                    value:
                      d.visitors.find((v) => v.status === 'CONTACTED')?._count
                        ._all ?? 0,
                    color: 'success.main',
                  },
                  {
                    label: 'Arquivados',
                    value:
                      d.visitors.find((v) => v.status === 'ARCHIVED')?._count
                        ._all ?? 0,
                    color: 'text.secondary',
                  },
                ]}
              />
            )}
          </Box>
          {d.upcomingEvents && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6">Agenda próxima</Typography>
                {!d.upcomingEvents.length && (
                  <Typography color="text.secondary" sx={{ mt: 2 }}>
                    Nenhum evento agendado.{' '}
                    <Button component={Link} to="/events">
                      Abrir agenda
                    </Button>
                  </Typography>
                )}
                <RecordTable>
                  {d.upcomingEvents.map((e) => (
                    <RecordRow
                      key={e.id}
                      primary={
                        <>
                          <Typography fontWeight={600}>{e.name}</Typography>
                        </>
                      }
                      actions={
                        <>
                          <Button component={Link} to="/events">
                            Ver agenda
                          </Button>
                        </>
                      }
                    >
                      <Typography variant="body2" color="text.secondary">
                        {formatDateTime(e.startsAt)} · {e.location}
                      </Typography>
                    </RecordRow>
                  ))}
                </RecordTable>
              </CardContent>
            </Card>
          )}
        </>
      )}
      {hasPermission('COMMUNITY_READ') && (
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button component={Link} to="/events?view=community">
            Eventos e inscrições
          </Button>
          <Button component={Link} to="/library">
            Livros e reservas
          </Button>
          <Button component={Link} to="/small-groups?view=community">
            Grupos familiares
          </Button>
          <Button component={Link} to="/ministries?view=community">
            Ministérios
          </Button>
        </Stack>
      )}
      {hasPermission('LIBRARY_DASHBOARD_READ') && <LibraryDashboardPanel />}
      {(hasPermission('FINANCE_DASHBOARD_READ') ||
        hasPermission('FINANCE_SUMMARY_READ')) && <FinancialDashboardPanel />}
      {!canCommunity &&
        !hasPermission('LIBRARY_DASHBOARD_READ') &&
        !hasPermission('FINANCE_DASHBOARD_READ') &&
        !hasPermission('COMMUNITY_READ') && (
          <Alert severity="info">
            Seu perfil não possui acesso aos painéis administrativos.{' '}
            <Button component={Link} to="/account">
              Minha conta
            </Button>
          </Alert>
        )}
    </Stack>
  );
}
