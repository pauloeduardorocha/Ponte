import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';
import type { User } from '../../lib/types';
import { getUserRoles, listRoles, updateUserRoles } from '../../lib/users-api';
import { errorMessage } from '../../lib/errors';
import { QueryError } from '../../components/PageParts';
export function RolesDialog({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selection, setSelection] = useState<string[] | null>(null);
  const roles = useQuery({ queryKey: ['available-roles'], queryFn: listRoles });
  const current = useQuery({
    queryKey: ['user-roles', user.id],
    queryFn: () => getUserRoles(user.id),
  });
  const selected = selection ?? current.data?.map((role) => role.id) ?? [];
  const mutation = useMutation({
    mutationFn: () => updateUserRoles(user.id, selected),
    onSuccess: onSaved,
  });
  const loaded = roles.isSuccess && current.isSuccess;
  const hasRestrictedRoles = current.data?.some(
    (role) =>
      !roles.data?.some((option) => option.id === role.id && option.assignable),
  );
  return (
    <Dialog
      open
      onClose={mutation.isPending ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Roles de {user.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={1} sx={{ pt: 1 }}>
          <Typography>
            Selecione os perfis de acesso. As permissões dos perfis selecionados
            acumulam-se.
          </Typography>
          {(roles.isPending || current.isPending) && (
            <CircularProgress size={24} aria-label="Carregando roles" />
          )}
          {roles.isError && (
            <QueryError
              error={roles.error}
              onRetry={() => void roles.refetch()}
            />
          )}
          {current.isError && (
            <QueryError
              error={current.error}
              onRetry={() => void current.refetch()}
            />
          )}
          {mutation.isError && (
            <Alert severity="error">{errorMessage(mutation.error)}</Alert>
          )}
          {hasRestrictedRoles && loaded && (
            <Alert severity="warning">
              Este usuário tem perfis com permissões superiores às suas. Outro
              administrador com essas permissões deve alterar os perfis.
            </Alert>
          )}
          {loaded &&
            roles.data.map((role) => (
              <FormControlLabel
                key={role.id}
                label={
                  role.name === 'EVENT_MANAGER'
                    ? 'Gestor de Eventos'
                    : role.name
                }
                control={
                  <Checkbox
                    checked={selected.includes(role.id)}
                    disabled={
                      !role.assignable ||
                      hasRestrictedRoles ||
                      mutation.isPending
                    }
                    onChange={(_, checked) =>
                      setSelection(
                        checked
                          ? [...selected, role.id]
                          : selected.filter((id) => id !== role.id),
                      )
                    }
                  />
                }
              />
            ))}
          {loaded && selected.length === 0 && (
            <Alert severity="info">
              Sem roles, o usuário fica sem permissões administrativas.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          disabled={
            !loaded ||
            hasRestrictedRoles ||
            mutation.isPending ||
            selection === null
          }
          onClick={() => mutation.mutate()}
        >
          Salvar roles
        </Button>
      </DialogActions>
    </Dialog>
  );
}
