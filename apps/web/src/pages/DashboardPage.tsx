import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import { useAuth } from '../auth/auth-context';
import { getHealth } from '../lib/api';
import { listMembers } from '../lib/members-api';
import { Can } from '../auth/guards';
import { LibraryDashboardPanel } from './library/LibraryPage';
import { getLibraryDashboard } from '../lib/library-api';

export function DashboardPage() {
  const { hasPermission } = useAuth();
  const canReadMembers = hasPermission('MEMBER_READ');
  const library = useQuery({
    queryKey: ['library', 'dashboard'],
    queryFn: getLibraryDashboard,
    enabled: hasPermission('LIBRARY_DASHBOARD_READ'),
  });
  const health = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    retry: 1,
  });
  const activeMembers = useQuery({
    queryKey: ['members', 'active-count'],
    queryFn: () =>
      listMembers({
        status: 'ACTIVE',
        page: 1,
        pageSize: 1,
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    enabled: canReadMembers,
  });

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="overline" color="primary" fontWeight={700}>
          {new Intl.DateTimeFormat('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
          })
            .format(new Date())
            .toLocaleUpperCase('pt-BR')}
        </Typography>
        <Typography variant="h4" component="h1" fontWeight={700}>
          Bom dia, comunidade
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Aqui está um resumo da vida da sua igreja.
        </Typography>
      </Box>

      {health.isError && (
        <Alert severity="warning">
          Não foi possível conectar à API. Verifique se os serviços estão em
          execução.
        </Alert>
      )}

      <Can permission="LIBRARY_DASHBOARD_READ">
        <LibraryDashboardPanel />
      </Can>
      <Box className="summary-grid">
        {[
          {
            label: 'Membros ativos',
            value: activeMembers.data ? String(activeMembers.data.total) : '—',
            detail: 'Cadastro de membros',
          },
          {
            label: 'Próximos eventos',
            value: '—',
            detail: 'Agenda da comunidade',
          },
          {
            label: 'Livros disponíveis',
            value: library.data ? String(library.data.available) : '—',
            detail: 'Acervo da biblioteca',
          },
        ].map((item) => (
          <Card key={item.label} variant="outlined" className="summary-card">
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                {item.label}
              </Typography>
              <Typography variant="h3" fontWeight={700} sx={{ my: 1 }}>
                {item.value}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.detail}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Box className="dashboard-panels">
        <Card variant="outlined">
          <CardContent>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Box>
                <Typography variant="h6" fontWeight={700}>
                  Visão geral
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Os indicadores aparecerão conforme os módulos forem ativados.
                </Typography>
              </Box>
              <Chip
                size="small"
                label={
                  health.isPending
                    ? 'Verificando'
                    : health.isSuccess
                      ? 'Sistema operacional'
                      : 'Sistema indisponível'
                }
                color={health.isSuccess ? 'success' : 'default'}
                icon={
                  health.isPending ? (
                    <CircularProgress size={14} aria-label="Verificando API" />
                  ) : undefined
                }
              />
            </Stack>
            <Box className="empty-state">
              <Typography fontWeight={600}>
                Seu painel está pronto para começar
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Os dados serão exibidos aqui quando os cadastros estiverem
                disponíveis.
              </Typography>
            </Box>
          </CardContent>
        </Card>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={700}>
              Próximos passos
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Configure os módulos da comunidade para preencher este espaço.
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="body2">Membros e ministérios</Typography>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="body2">Eventos e biblioteca</Typography>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="body2">Relatórios e financeiro</Typography>
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}
