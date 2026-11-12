import { t as translate, useLocale } from '../i18n';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Pagination,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { apiRequest } from '../lib/api';
import { useAuth } from '../auth/auth-context';
import { canApproveRegistrations } from '@church/shared';
import { ForbiddenPage } from '../auth/guards';
import { PageHeader } from '../components/PageParts';
import { formatDate, formatDateOnly } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { useDebouncedValue } from '../lib/use-debounced-value';
import type { Paginated } from '../lib/types';

type PendingAccount = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  member: { phone: string | null; birthDate: string | null } | null;
};

export function PendingApprovalsPage() {
  useLocale();
  const { user } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const allowed = canApproveRegistrations(user);
  const query = useQuery({
    queryKey: ['pending-approvals', user?.id, page, debouncedSearch],
    queryFn: () =>
      apiRequest<Paginated<PendingAccount>>(
        `/users/pending-approvals?page=${page}&pageSize=20&search=${encodeURIComponent(debouncedSearch)}`,
      ),
    enabled: allowed,
  });
  const approval = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/users/${id}/approve`, { method: 'POST' }),
    onSuccess: async () => {
      setNotice(translate('Conta aprovada com acesso padrão de membro.'));
      await client.invalidateQueries({ queryKey: ['pending-approvals'] });
      await client.invalidateQueries({ queryKey: ['members'] });
      if (query.data?.items.length === 1 && page > 1) setPage(page - 1);
    },
  });
  if (!allowed) return <ForbiddenPage />;
  return (
    <Stack spacing={3}>
      <PageHeader
        title={translate('Lista de espera')}
        subtitle={translate(
          'Aprove os cadastros para liberar o acesso padrão de membro. Nenhuma função administrativa será atribuída.',
        )}
      />
      <TextField
        label={translate('Buscar por nome ou e-mail')}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />
      {notice && <Alert severity="success">{translate(notice ?? '')}</Alert>}
      {approval.isError && (
        <Alert severity="error">{errorMessage(approval.error)}</Alert>
      )}
      {query.isPending && (
        <CircularProgress
          aria-label={translate('Carregando lista de espera')}
        />
      )}
      {query.isError && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void query.refetch()}>
              {translate('Tentar novamente')}
            </Button>
          }
        >
          {errorMessage(query.error)}
        </Alert>
      )}
      {query.data && (
        <Typography>
          {query.data.total} {translate(' cadastro(s) aguardando aprovação')}
        </Typography>
      )}
      {query.data?.items.length === 0 && (
        <Alert severity="info">
          {translate('Nenhum cadastro aguardando aprovação.')}
        </Alert>
      )}
      {query.data?.items.map((account) => (
        <Card key={account.id} variant="outlined">
          <CardContent>
            <Stack spacing={1}>
              <Typography component="h2" variant="h6">
                {account.name}
              </Typography>
              <Typography>{account.email}</Typography>
              <Typography>
                {translate('Telefone: ')}
                {account.member?.phone ?? translate('Não informado')}
              </Typography>
              <Typography>
                {translate('Nascimento:')}{' '}
                {account.member?.birthDate
                  ? formatDateOnly(account.member.birthDate)
                  : translate('Não informado')}
              </Typography>
              <Typography>
                {translate('Cadastrado em ')}
                {formatDate(account.createdAt)}
              </Typography>
              <Button
                variant="contained"
                disabled={approval.isPending}
                aria-label={translate('Aprovar {0}', [account.name])}
                onClick={() => {
                  setNotice('');
                  approval.mutate(account.id);
                }}
              >
                {translate('Aprovar cadastro')}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ))}
      {query.data && query.data.total > 20 && (
        <Pagination
          count={Math.ceil(query.data.total / 20)}
          page={page}
          onChange={(_, value) => setPage(value)}
          aria-label={translate('Páginas da lista de espera')}
        />
      )}
    </Stack>
  );
}
