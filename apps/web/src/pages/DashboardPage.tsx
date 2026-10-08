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
  const { hasPermission, user } = useAuth();
  const canCommunity = ['MEMBER_READ', 'VISITOR_READ', 'EVENT_READ'].some((p) =>
    user?.permissions.some((code) => code === p),
  );
  const health = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    retry: 1,
    staleTime: 60000,
  });
  const community = useQuery({
    queryKey: ['community', 'dashboard'],
    queryFn: () => apiRequest<Community>('/community/dashboard'),
    enabled: canCommunity,
    staleTime: 30000,
  });
  const d = community.data;
  return (
    <Stack spacing={4}>
      <OperationalDashboard />
      <Box>
        <Typography variant="overline" color="primary.main">
          {new Date().toLocaleDateString('pt-PT', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Typography>
        <Typography variant="h4" component="h1">
          Bom dia, comunidade
        </Typography>
        <Typography color="text.secondary">
          Olá, {user?.name}. Acompanhe os dados e acesse as listas pelo seu
          painel.
        </Typography>
      </Box>
      {health.isError && (
        <Alert severity="warning">
          Não foi possível conectar à API. Tente novamente em instantes.
        </Alert>
      )}
      {canCommunity && community.isPending && (
        <Skeleton
          variant="rounded"
          height={140}
          aria-label="Carregando indicadores da comunidade"
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
          Não foi possível carregar os indicadores da comunidade.
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
                detail="Agenda da comunidade"
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
                    color: '#24754c',
                  },
                  {
                    label: 'Inativos',
                    value:
                      d.members.find((m) => m.status === 'INACTIVE')?._count
                        ._all ?? 0,
                    color: '#64748b',
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
                    color: '#a85d08',
                  },
                  {
                    label: 'Contactados',
                    value:
                      d.visitors.find((v) => v.status === 'CONTACTED')?._count
                        ._all ?? 0,
                    color: '#24754c',
                  },
                  {
                    label: 'Arquivados',
                    value:
                      d.visitors.find((v) => v.status === 'ARCHIVED')?._count
                        ._all ?? 0,
                    color: '#64748b',
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
                {d.upcomingEvents.map((e) => (
                  <Stack
                    key={e.id}
                    direction="row"
                    justifyContent="space-between"
                    gap={2}
                    sx={{ py: 1 }}
                  >
                    <Box>
                      <Typography fontWeight={600}>{e.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(e.startsAt).toLocaleString('pt-PT')} ·{' '}
                        {e.location}
                      </Typography>
                    </Box>
                    <Button component={Link} to="/events">
                      Ver agenda
                    </Button>
                  </Stack>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
      {hasPermission('LIBRARY_DASHBOARD_READ') && <LibraryDashboardPanel />}
      {hasPermission('FINANCE_DASHBOARD_READ') && <FinancialDashboardPanel />}
      {!canCommunity &&
        !hasPermission('LIBRARY_DASHBOARD_READ') &&
        !hasPermission('FINANCE_DASHBOARD_READ') && (
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
