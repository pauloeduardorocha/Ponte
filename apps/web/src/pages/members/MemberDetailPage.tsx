import { t as translate, useLocale } from '../../i18n';
import { STATUS_LABELS } from '../../lib/status-labels';
import { RolesDialog } from './MemberRolesDialog';
import { useAuth } from '../../auth/auth-context';
import { apiRequest } from '../../lib/api';
import { updateUserStatus } from '../../lib/users-api';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
  TextField,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { Can } from '../../auth/guards';
import { PageHeader, QueryError } from '../../components/PageParts';
import { ApiError } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDate, formatDateOnly } from '../../lib/format';
import { deleteMember, getMember } from '../../lib/members-api';
import { MemberStatusChip } from './MemberStatusChip';
import { MemberLibraryHistory } from '../library/LibraryHistory';
import { MemberFamily } from '../../components/MemberFamily';

function Field({ label, value }: { label: string; value: string }) {
  useLocale();
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ whiteSpace: 'pre-wrap' }}>{value}</Typography>
    </Box>
  );
}

export function MemberDetailPage() {
  useLocale();
  const { user: currentUser, hasPermission, clearSession } = useAuth();
  const administrator =
    currentUser?.roles?.some(
      (role) => role === 'ADMIN' || role === 'SUPER_ADMIN',
    ) ?? false;
  const [password, setPassword] = useState('');
  const [rolesOpen, setRolesOpen] = useState(false);
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const member = useQuery({
    queryKey: ['member', id],
    queryFn: () => getMember(id),
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/users/${member.data!.user!.id}/password`, {
        method: 'POST',
        body: { password },
      }),
    onSuccess: () => {
      setPassword('');
      if (member.data?.user?.id === currentUser?.id) {
        clearSession();
        navigate('/login', {
          replace: true,
          state: { notice: translate('Senha alterada. Entre novamente.') },
        });
      }
    },
  });
  const access = useMutation({
    mutationFn: () =>
      updateUserStatus(
        member.data!.user!.id,
        member.data!.user!.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED',
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['member', id] }),
  });
  const removal = useMutation({
    mutationFn: () => deleteMember(id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['member', id] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      await queryClient.invalidateQueries({
        queryKey: ['community', 'birthdays'],
      });
      navigate('/members', {
        replace: true,
        state: { notice: translate('Membro excluído com sucesso.') },
      });
    },
  });

  if (member.isPending) {
    return <CircularProgress aria-label={translate('Carregando')} />;
  }

  if (member.isError) {
    return (
      <Stack spacing={2}>
        <PageHeader title={translate('Membro')} />
        {member.error instanceof ApiError && member.error.status === 404 ? (
          <Alert severity="warning">
            {translate('Membro não encontrado.')}
          </Alert>
        ) : (
          <QueryError
            error={member.error}
            onRetry={() => void member.refetch()}
          />
        )}
        <Box>
          <Button
            component={RouterLink}
            to="/members"
            startIcon={<ArrowBackRounded />}
          >
            {translate('Voltar para membros')}
          </Button>
        </Box>
      </Stack>
    );
  }

  const data = member.data;

  return (
    <Stack spacing={3}>
      <PageHeader
        title={data.name}
        subtitle={translate('Detalhes do membro')}
        actions={
          <>
            <Button
              component={RouterLink}
              to="/members"
              startIcon={<ArrowBackRounded />}
            >
              {translate('Voltar')}
            </Button>
            <Can permission="MEMBER_UPDATE">
              <Button
                component={RouterLink}
                to={`/members/${data.id}/edit`}
                variant="outlined"
                startIcon={<EditRounded />}
              >
                {translate('Editar')}
              </Button>
            </Can>
            <Can permission="MEMBER_DELETE">
              <Button
                color="error"
                variant="outlined"
                startIcon={<DeleteRounded />}
                onClick={() => setConfirmOpen(true)}
              >
                {translate('Excluir')}
              </Button>
            </Can>
          </>
        }
      />

      {notice && <Alert severity="success">{translate(notice ?? '')}</Alert>}

      <Card variant="outlined">
        <CardContent>
          <Box className="detail-grid">
            <Field label={translate('Nome')} value={data.name} />
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                component="p"
              >
                {translate('Status')}
              </Typography>
              <MemberStatusChip status={data.status} />
            </Box>
            <Field label={translate('E-mail')} value={data.email ?? '—'} />
            <Field label={translate('Telefone')} value={data.phone ?? '—'} />
            <Field label="IBAN" value={data.iban ?? '—'} />
            <Field
              label={translate('Data de nascimento')}
              value={formatDateOnly(data.birthDate)}
            />
            <Field
              label={translate('Cadastrado em')}
              value={formatDate(data.createdAt)}
            />
            <Field
              label={translate('Atualizado em')}
              value={formatDate(data.updatedAt)}
            />
          </Box>
          <Box sx={{ mt: 3 }}>
            <Field label={translate('Observações')} value={data.notes ?? '—'} />
          </Box>
        </CardContent>
      </Card>

      <MemberFamily
        memberId={data.id}
        canEdit={
          hasPermission('MEMBER_UPDATE') || currentUser?.memberId === data.id
        }
      />
      {data.user && (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">
                {translate('Acesso à plataforma')}
              </Typography>
              <Typography>
                {data.user.email} · {STATUS_LABELS[data.user.status]}
              </Typography>
              {hasPermission('USER_UPDATE') &&
                data.user.status !== 'PENDING_APPROVAL' &&
                data.user.id !== currentUser?.id && (
                  <Button
                    disabled={access.isPending}
                    onClick={() => access.mutate()}
                  >
                    {data.user.status === 'DISABLED'
                      ? translate('Ativar acesso')
                      : translate('Desativar acesso')}
                  </Button>
                )}
              {hasPermission('PERMISSION_MANAGE') &&
                data.user.id !== currentUser?.id && (
                  <Button onClick={() => setRolesOpen(true)}>
                    {translate('Gerenciar roles')}
                  </Button>
                )}
              {access.isError && (
                <Alert severity="error">{errorMessage(access.error)}</Alert>
              )}
              {hasPermission('USER_UPDATE') &&
                (administrator || data.user.id !== currentUser?.id) && (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField
                      label={translate('Nova senha de acesso')}
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      helperText={translate('Entre 12 e 128 caracteres')}
                    />
                    <Button
                      disabled={
                        password.length < 12 ||
                        password.length > 128 ||
                        passwordMutation.isPending
                      }
                      onClick={() => passwordMutation.mutate()}
                    >
                      {translate('Definir senha')}
                    </Button>
                  </Stack>
                )}
              {passwordMutation.isError && (
                <Alert severity="error">
                  {errorMessage(passwordMutation.error)}
                </Alert>
              )}
              {passwordMutation.isSuccess && (
                <Alert severity="success">{translate('Senha definida.')}</Alert>
              )}
              <Typography variant="body2">
                {translate(
                  'Sem roles, o membro pode consultar eventos, reservar livros, ver o balanço financeiro e os grupos e ministérios. Um administrador pode definir a primeira senha no cadastro.',
                )}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      )}
      {rolesOpen && data.user && (
        <RolesDialog
          user={data.user}
          onClose={() => setRolesOpen(false)}
          onSaved={() => {
            setRolesOpen(false);
            void queryClient.invalidateQueries({
              queryKey: ['user-roles', data.user!.id],
            });
          }}
        />
      )}
      <Can permission="LIBRARY_HISTORY_READ">
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {translate('Histórico da biblioteca')}
            </Typography>
            <MemberLibraryHistory memberId={data.id} />
          </CardContent>
        </Card>
      </Can>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>{translate('Excluir membro')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              {translate('Tem certeza de que deseja excluir ')}
              {data.name}
              {translate('? Esta ação não pode ser desfeita.')}
            </DialogContentText>
            {removal.isError && (
              <Alert severity="error">{errorMessage(removal.error)}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>
            {translate('Cancelar')}
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={removal.isPending}
            onClick={() => removal.mutate()}
          >
            {translate('Confirmar exclusão')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
