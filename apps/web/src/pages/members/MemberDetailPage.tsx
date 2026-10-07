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
} from '@mui/material';
import {
  ArrowBackRounded,
  DeleteRounded,
  EditRounded,
} from '@mui/icons-material';
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

function Field({ label, value }: { label: string; value: string }) {
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

  const removal = useMutation({
    mutationFn: () => deleteMember(id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['member', id] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      navigate('/members', {
        replace: true,
        state: { notice: 'Membro excluído com sucesso.' },
      });
    },
  });

  if (member.isPending) {
    return <CircularProgress aria-label="Carregando" />;
  }

  if (member.isError) {
    return (
      <Stack spacing={2}>
        <PageHeader title="Membro" />
        {member.error instanceof ApiError && member.error.status === 404 ? (
          <Alert severity="warning">Membro não encontrado.</Alert>
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
            Voltar para membros
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
        subtitle="Detalhes do membro"
        actions={
          <>
            <Button
              component={RouterLink}
              to="/members"
              startIcon={<ArrowBackRounded />}
            >
              Voltar
            </Button>
            <Can permission="MEMBER_UPDATE">
              <Button
                component={RouterLink}
                to={`/members/${data.id}/edit`}
                variant="outlined"
                startIcon={<EditRounded />}
              >
                Editar
              </Button>
            </Can>
            <Can permission="MEMBER_DELETE">
              <Button
                color="error"
                variant="outlined"
                startIcon={<DeleteRounded />}
                onClick={() => setConfirmOpen(true)}
              >
                Excluir
              </Button>
            </Can>
          </>
        }
      />

      {notice && <Alert severity="success">{notice}</Alert>}

      <Card variant="outlined">
        <CardContent>
          <Box className="detail-grid">
            <Field label="Nome" value={data.name} />
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                component="p"
              >
                Status
              </Typography>
              <MemberStatusChip status={data.status} />
            </Box>
            <Field label="E-mail" value={data.email ?? '—'} />
            <Field label="Telefone" value={data.phone ?? '—'} />
            <Field
              label="Data de nascimento"
              value={formatDateOnly(data.birthDate)}
            />
            <Field label="Cadastrado em" value={formatDate(data.createdAt)} />
            <Field label="Atualizado em" value={formatDate(data.updatedAt)} />
          </Box>
          <Box sx={{ mt: 3 }}>
            <Field label="Observações" value={data.notes ?? '—'} />
          </Box>
        </CardContent>
      </Card>

      <Can permission="LIBRARY_HISTORY_READ">
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Histórico da biblioteca
            </Typography>
            <MemberLibraryHistory memberId={data.id} />
          </CardContent>
        </Card>
      </Can>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Excluir membro</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              Tem certeza de que deseja excluir {data.name}? Esta ação não pode
              ser desfeita.
            </DialogContentText>
            {removal.isError && (
              <Alert severity="error">{errorMessage(removal.error)}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancelar</Button>
          <Button
            color="error"
            variant="contained"
            disabled={removal.isPending}
            onClick={() => removal.mutate()}
          >
            Confirmar exclusão
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
