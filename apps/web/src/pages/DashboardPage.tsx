import { t as translate, useLocale } from '../i18n';
import { formatDate, formatDateTime } from '../lib/format';
import { ConversationsCarousel } from '../components/Conversations';
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
  useLocale();
  const { user } = useAuth();
  if (user?.status === 'PENDING_APPROVAL')
    return (
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          {translate('Olá, ')}
          {user.name}
        </Typography>
        <Alert severity="info">
          {translate(
            'Sua conta está aguardando aprovação de um administrador ou pastor. Enquanto isso, você pode assistir aos vídeos da igreja e ver os aniversariantes.',
          )}
        </Alert>
        <YouTubeCarousel />
        <BirthdaysCard />
      </Stack>
    );
  return <ApprovedDashboard />;
}

function ApprovedDashboard() {
  useLocale();
  const { hasPermission, user } = useAuth();
  const firstName = user?.name.trim().split(/\s+/)[0];
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
          {firstName
            ? translate('Olá, {0}', [firstName])
            : translate('Visão geral')}
        </Typography>
      </Box>
      <ConversationsCarousel />
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
          {translate(
            'Não foi possível conectar à API. Tente novamente em instantes.',
          )}
        </Alert>
      )}
      {canCommunity && community.isPending && (
        <Skeleton
          variant="rounded"
          height={140}
          aria-label={translate('Carregando indicadores de A Ponte')}
        />
      )}
      {community.isError && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void community.refetch()}>
              {translate('Tentar novamente')}
            </Button>
          }
        >
          {translate('Não foi possível carregar os indicadores de A Ponte.')}
        </Alert>
      )}
      {d && (
        <>
          <Box className="metric-grid">
            {d.members && (
              <MetricCard
                label={translate('Membros ativos')}
                value={
                  d.members.find((m) => m.status === 'ACTIVE')?._count._all ?? 0
                }
                detail={translate('{0} membros cadastrados', [
                  d.members.reduce((v, m) => v + m._count._all, 0),
                ])}
                href="/members?status=ACTIVE"
              />
            )}
            {d.visitors && (
              <MetricCard
                label={translate('Visitantes')}
                value={d.visitors.reduce((v, m) => v + m._count._all, 0)}
                detail={translate('Acolhimento e acompanhamento')}
                color="info.main"
                href="/visitors"
              />
            )}
            {d.events !== undefined && (
              <MetricCard
                label={translate('Próximos eventos')}
                value={d.events}
                detail={translate('Agenda de A Ponte')}
                color="secondary.main"
                href="/events?status=SCHEDULED"
              />
            )}
          </Box>
          <Box className="dashboard-panels">
            {d.members && (
              <BreakdownChart
                title={translate('Situação dos membros')}
                items={[
                  {
                    label: translate('Ativos'),
                    value:
                      d.members.find((m) => m.status === 'ACTIVE')?._count
                        ._all ?? 0,
                    color: 'success.main',
                  },
                  {
                    label: translate('Inativos'),
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
                title={translate('Acompanhamento de visitantes')}
                items={[
                  {
                    label: translate('Novos'),
                    value:
                      d.visitors.find((v) => v.status === 'NEW')?._count._all ??
                      0,
                    color: 'warning.main',
                  },
                  {
                    label: translate('Contactados'),
                    value:
                      d.visitors.find((v) => v.status === 'CONTACTED')?._count
                        ._all ?? 0,
                    color: 'success.main',
                  },
                  {
                    label: translate('Arquivados'),
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
                <Typography variant="h6">
                  {translate('Agenda próxima')}
                </Typography>
                {!d.upcomingEvents.length && (
                  <Typography color="text.secondary" sx={{ mt: 2 }}>
                    {translate('Nenhum evento agendado.')}{' '}
                    <Button component={Link} to="/events">
                      {translate('Abrir agenda')}
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
                            {translate('Ver agenda')}
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
            {translate('Eventos e inscrições')}
          </Button>
          <Button component={Link} to="/library">
            {translate('Livros e reservas')}
          </Button>
          <Button component={Link} to="/small-groups?view=community">
            {translate('Grupos familiares')}
          </Button>
          <Button component={Link} to="/ministries?view=community">
            {translate('Ministérios')}
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
            {translate(
              'Seu perfil não possui acesso aos painéis administrativos.',
            )}{' '}
            <Button component={Link} to="/account">
              {translate('Minha conta')}
            </Button>
          </Alert>
        )}
    </Stack>
  );
}
