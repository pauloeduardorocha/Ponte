import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { PersonAddRounded } from '@mui/icons-material';
import { useAuth } from '../auth/auth-context';
import { Can } from '../auth/guards';
import { PageHeader, QueryError } from '../components/PageParts';
import { errorMessage } from '../lib/errors';
import type { User, UserStatus } from '../lib/types';
import { createUser, listUsers, updateUserStatus } from '../lib/users-api';
import { emailSchema, nameSchema, passwordSchema } from '../lib/validation';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

type CreateUserFields = z.infer<typeof createUserSchema>;

function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (user: User) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState, reset } =
    useForm<CreateUserFields>({
      resolver: zodResolver(createUserSchema),
      defaultValues: { name: '', email: '', password: '' },
    });

  function close() {
    reset();
    setError(null);
    onClose();
  }

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const user = await createUser(values);
      reset();
      onCreated(user);
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <Box component="form" onSubmit={onSubmit} noValidate>
        <DialogTitle>Novo usuário</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Nome"
              error={Boolean(formState.errors.name)}
              helperText={formState.errors.name?.message}
              {...register('name')}
            />
            <TextField
              label="E-mail"
              type="email"
              error={Boolean(formState.errors.email)}
              helperText={formState.errors.email?.message}
              {...register('email')}
            />
            <TextField
              label="Senha inicial"
              type="password"
              autoComplete="new-password"
              error={Boolean(formState.errors.password)}
              helperText={formState.errors.password?.message}
              {...register('password')}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Cancelar</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={formState.isSubmitting}
          >
            Criar usuário
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export function UsersPage() {
  const { user: currentUser, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const canUpdate = hasPermission('USER_UPDATE');

  const users = useQuery({
    queryKey: ['users', { page, pageSize }],
    queryFn: () => listUsers({ page, pageSize }),
    placeholderData: keepPreviousData,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      updateUserStatus(id, status),
    onSuccess: (user) => {
      setNotice(
        user.status === 'ACTIVE'
          ? `Usuário ${user.name} ativado.`
          : `Usuário ${user.name} desativado.`,
      );
      return queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Usuários"
        subtitle="Gerencie o acesso das pessoas à plataforma."
        actions={
          <Can permission="USER_CREATE">
            <Button
              variant="contained"
              startIcon={<PersonAddRounded />}
              onClick={() => setDialogOpen(true)}
            >
              Novo usuário
            </Button>
          </Can>
        }
      />

      {notice && (
        <Alert severity="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {statusMutation.isError && (
        <Alert severity="error">{errorMessage(statusMutation.error)}</Alert>
      )}
      {users.isError && (
        <QueryError error={users.error} onRetry={() => void users.refetch()} />
      )}

      <Card variant="outlined">
        <TableContainer>
          <Table aria-label="Lista de usuários">
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>E-mail</TableCell>
                <TableCell>Status</TableCell>
                {canUpdate && <TableCell align="right">Ações</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.isPending && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <CircularProgress size={24} aria-label="Carregando" />
                  </TableCell>
                </TableRow>
              )}
              {users.data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography color="text.secondary" align="center">
                      Nenhum usuário encontrado.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {users.data?.items.map((user) => {
                const isActive = user.status === 'ACTIVE';
                return (
                  <TableRow key={user.id} hover>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={isActive ? 'success' : 'default'}
                        label={isActive ? 'Ativo' : 'Desativado'}
                      />
                    </TableCell>
                    {canUpdate && (
                      <TableCell align="right">
                        {user.id !== currentUser?.id && (
                          <Button
                            size="small"
                            color={isActive ? 'warning' : 'primary'}
                            disabled={statusMutation.isPending}
                            aria-label={`${isActive ? 'Desativar' : 'Ativar'} ${user.name}`}
                            onClick={() =>
                              statusMutation.mutate({
                                id: user.id,
                                status: isActive ? 'DISABLED' : 'ACTIVE',
                              })
                            }
                          >
                            {isActive ? 'Desativar' : 'Ativar'}
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={users.data?.total ?? 0}
          page={page - 1}
          rowsPerPage={pageSize}
          rowsPerPageOptions={PAGE_SIZE_OPTIONS}
          onPageChange={(_, next) => setPage(next + 1)}
          onRowsPerPageChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
          labelRowsPerPage="Itens por página"
          labelDisplayedRows={({ from, to, count }) =>
            `${from}–${to} de ${count}`
          }
        />
      </Card>

      <CreateUserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(user) => {
          setDialogOpen(false);
          setNotice(`Usuário ${user.name} criado.`);
          void queryClient.invalidateQueries({ queryKey: ['users'] });
        }}
      />
    </Stack>
  );
}
