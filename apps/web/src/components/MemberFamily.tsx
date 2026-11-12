import { t as translate, useLocale } from '../i18n';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { FamilyInput, FamilyLink, FamilyRelation } from '@church/shared';
import { apiRequest } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatDateOnly } from '../lib/format';
import { STATUS_LABELS } from '../lib/status-labels';

const labels: Record<FamilyRelation, string> = {
  get FATHER() {
    return translate('Pai');
  },
  get MOTHER() {
    return translate('Mãe');
  },
  get CHILD() {
    return translate('Filho(a)');
  },
  get SPOUSE() {
    return translate('Cônjuge');
  },
};
const emptyForm = {
  name: '',
  birthDate: '',
  email: '',
  phone: '',
  password: '',
};

export function MemberFamily({
  memberId = 'me',
  canEdit = true,
}: {
  memberId?: string;
  canEdit?: boolean;
}) {
  useLocale();
  const client = useQueryClient();
  const base = `/member-family/${encodeURIComponent(memberId)}`;
  const family = useQuery({
    queryKey: ['member-family', memberId],
    queryFn: () => apiRequest<FamilyLink[]>(base),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FamilyLink | null>(null);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [relation, setRelation] = useState<FamilyRelation>('SPOUSE');
  const [parentRole, setParentRole] = useState<'FATHER' | 'MOTHER'>('FATHER');
  const [fields, setFields] = useState(emptyForm);
  const [createAccount, setCreateAccount] = useState(false);
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [removing, setRemoving] = useState<FamilyLink | null>(null);
  const [notice, setNotice] = useState('');
  const results = useQuery({
    queryKey: ['family-search', memberId, searchTerm],
    queryFn: () =>
      apiRequest<{ id: string; name: string }[]>(`${base}/search`, {
        query: { search: searchTerm },
      }),
    enabled: open && mode === 'existing' && !editing && searchTerm.length >= 2,
  });
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['member-family'] });
    await client.invalidateQueries({ queryKey: ['members'] });
    await client.invalidateQueries({ queryKey: ['pending-approvals'] });
  }
  const save = useMutation({
    mutationFn: (input: FamilyInput) =>
      apiRequest(base, { method: 'POST', body: input }),
    onSuccess: async (_, input) => {
      setOpen(false);
      setFields(emptyForm);
      setNotice(
        input.createAccount
          ? translate(
              'Familiar cadastrado. O acesso está aguardando aprovação.',
            )
          : translate('Vínculo familiar salvo.'),
      );
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (link: FamilyLink) =>
      apiRequest(`${base}/${encodeURIComponent(link.id)}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      setRemoving(null);
      setNotice(translate('Vínculo removido dos dois cadastros.'));
      await refresh();
    },
  });
  function start(link: FamilyLink | null = null) {
    setEditing(link);
    setMode(link ? 'existing' : 'new');
    setSelected(link?.member ?? null);
    setRelation(link?.relation ?? 'SPOUSE');
    setParentRole(link?.parentRole === 'MOTHER' ? 'MOTHER' : 'FATHER');
    setCreateAccount(false);
    setFields(emptyForm);
    setSearch('');
    setSearchTerm('');
    save.reset();
    setOpen(true);
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: FamilyInput = {
      relation,
      ...(relation === 'CHILD' ? { parentRole } : {}),
    };
    if (mode === 'existing') {
      if (!selected) return;
      input.memberId = selected.id;
    } else {
      Object.assign(input, {
        name: fields.name.trim(),
        birthDate: fields.birthDate,
        createAccount,
        ...(fields.email.trim() ? { email: fields.email.trim() } : {}),
        ...(fields.phone.trim() ? { phone: fields.phone.trim() } : {}),
        ...(createAccount ? { password: fields.password } : {}),
      });
    }
    save.mutate(input);
  }
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">{translate('Família')}</Typography>
          {family.isPending && (
            <CircularProgress
              size={24}
              aria-label={translate('Carregando familiares')}
            />
          )}
          {family.isError && (
            <Alert
              severity="error"
              action={
                <Button onClick={() => void family.refetch()}>
                  {translate('Tentar novamente')}
                </Button>
              }
            >
              {errorMessage(family.error)}
            </Alert>
          )}
          {notice && (
            <Alert severity="success">{translate(notice ?? '')}</Alert>
          )}
          {family.data?.length === 0 && (
            <Typography color="text.secondary">
              {translate('Nenhum vínculo familiar cadastrado.')}
            </Typography>
          )}
          {family.data?.map((link) => (
            <Stack
              key={link.id}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              justifyContent="space-between"
            >
              <Box>
                <Typography fontWeight={600}>
                  {link.member.name} · {labels[link.relation]}
                </Typography>
                <Typography variant="body2">
                  {translate('Nascimento: ')}
                  {formatDateOnly(link.member.birthDate)} ·{' '}
                  {link.member.user
                    ? STATUS_LABELS[link.member.user.status]
                    : translate('Sem acesso ao sistema')}
                </Typography>
              </Box>
              {canEdit && (
                <Stack direction="row">
                  <Button
                    onClick={() => start(link)}
                    aria-label={translate('Editar vínculo com {0}', [
                      link.member.name,
                    ])}
                  >
                    {translate('Editar vínculo')}
                  </Button>
                  <Button
                    color="error"
                    onClick={() => {
                      remove.reset();
                      setRemoving(link);
                    }}
                    aria-label={translate('Remover vínculo com {0}', [
                      link.member.name,
                    ])}
                  >
                    {translate('Remover')}
                  </Button>
                </Stack>
              )}
            </Stack>
          ))}
          {canEdit && (
            <Box>
              <Button variant="outlined" onClick={() => start()}>
                {translate('Adicionar familiar')}
              </Button>
            </Box>
          )}
        </Stack>
      </CardContent>
      <Dialog
        open={open}
        onClose={() => {
          if (!save.isPending) {
            setOpen(false);
            setFields(emptyForm);
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={submit}>
          <DialogTitle>
            {editing
              ? translate('Editar vínculo familiar')
              : translate('Adicionar familiar')}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {!editing && (
                <TextField
                  select
                  label={translate('Cadastro do familiar')}
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as 'new' | 'existing');
                    setSelected(null);
                    setFields(emptyForm);
                    setCreateAccount(false);
                  }}
                >
                  <MenuItem value="new">{translate('Novo familiar')}</MenuItem>
                  <MenuItem value="existing">
                    {translate('Membro existente')}
                  </MenuItem>
                </TextField>
              )}
              <TextField
                select
                label={translate('Grau de parentesco do familiar')}
                value={relation}
                onChange={(e) => setRelation(e.target.value as FamilyRelation)}
              >
                {Object.entries(labels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
              {relation === 'CHILD' && (
                <TextField
                  select
                  label={translate('O membro principal é')}
                  value={parentRole}
                  onChange={(e) =>
                    setParentRole(e.target.value as 'FATHER' | 'MOTHER')
                  }
                >
                  <MenuItem value="FATHER">{translate('Pai')}</MenuItem>
                  <MenuItem value="MOTHER">{translate('Mãe')}</MenuItem>
                </TextField>
              )}
              {mode === 'existing' ? (
                <>
                  {editing ? (
                    <Typography>{selected?.name}</Typography>
                  ) : (
                    <>
                      <TextField
                        label={translate('Buscar membro pelo nome')}
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setSelected(null);
                        }}
                      />
                      <Button
                        disabled={
                          search.trim().length < 2 || results.isFetching
                        }
                        onClick={() => {
                          setSearchTerm(search.trim());
                          if (search.trim() === searchTerm)
                            void results.refetch();
                        }}
                      >
                        {translate('Buscar membro')}
                      </Button>
                      {results.isFetching && (
                        <CircularProgress
                          size={24}
                          aria-label={translate('Buscando membros')}
                        />
                      )}
                      {results.isError && (
                        <Alert severity="error">
                          {errorMessage(results.error)}
                        </Alert>
                      )}
                      {results.data?.length === 0 && (
                        <Typography>
                          {translate('Nenhum membro encontrado.')}
                        </Typography>
                      )}
                      {!!results.data?.length && (
                        <TextField
                          select
                          required
                          label={translate('Membro existente')}
                          value={selected?.id ?? ''}
                          onChange={(e) =>
                            setSelected(
                              results.data.find(
                                (person) => person.id === e.target.value,
                              ) ?? null,
                            )
                          }
                        >
                          {results.data.map((person) => (
                            <MenuItem key={person.id} value={person.id}>
                              {person.name}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <TextField
                    required
                    label={translate('Nome do familiar')}
                    value={fields.name}
                    onChange={(e) =>
                      setFields({ ...fields, name: e.target.value })
                    }
                    slotProps={{ htmlInput: { maxLength: 120 } }}
                  />
                  <TextField
                    required
                    label={translate('Data de nascimento do familiar')}
                    type="date"
                    value={fields.birthDate}
                    onChange={(e) =>
                      setFields({ ...fields, birthDate: e.target.value })
                    }
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: { max: new Date().toISOString().slice(0, 10) },
                    }}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={createAccount}
                        onChange={(_, checked) => {
                          setCreateAccount(checked);
                          setFields({ ...fields, password: '' });
                        }}
                      />
                    }
                    label={translate('Criar acesso ao sistema para o familiar')}
                  />
                  <TextField
                    required={createAccount}
                    label={translate('E-mail do familiar')}
                    type="email"
                    value={fields.email}
                    onChange={(e) =>
                      setFields({ ...fields, email: e.target.value })
                    }
                    slotProps={{ htmlInput: { maxLength: 320 } }}
                  />
                  <TextField
                    required={createAccount}
                    label={translate('Telefone do familiar')}
                    type="tel"
                    value={fields.phone}
                    onChange={(e) =>
                      setFields({ ...fields, phone: e.target.value })
                    }
                    slotProps={{ htmlInput: { maxLength: 32 } }}
                  />
                  {createAccount && (
                    <>
                      <TextField
                        required
                        label={translate('Senha do familiar')}
                        type="password"
                        autoComplete="new-password"
                        value={fields.password}
                        onChange={(e) =>
                          setFields({ ...fields, password: e.target.value })
                        }
                        helperText={translate('Entre 12 e 128 caracteres')}
                        slotProps={{
                          htmlInput: { minLength: 12, maxLength: 128 },
                        }}
                      />
                      <Alert severity="info">
                        {translate(
                          'O acesso será enviado para a fila de aprovação.',
                        )}
                      </Alert>
                    </>
                  )}
                </>
              )}
              <Typography variant="body2" color="text.secondary">
                {translate('O vínculo será atualizado nos dois cadastros.')}
              </Typography>
              {save.isError && (
                <Alert severity="error">{errorMessage(save.error)}</Alert>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              disabled={save.isPending}
              onClick={() => {
                setOpen(false);
                setFields(emptyForm);
              }}
            >
              {translate('Cancelar')}
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={save.isPending || (mode === 'existing' && !selected)}
            >
              {translate('Salvar vínculo')}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
      <Dialog
        open={!!removing}
        onClose={() => {
          if (!remove.isPending) setRemoving(null);
        }}
      >
        <DialogTitle>{translate('Remover vínculo familiar')}</DialogTitle>
        <DialogContent>
          <Typography>
            {translate('Remover o vínculo com ')}
            {removing?.member.name}{' '}
            {translate(
              ' dos dois cadastros? O cadastro e o acesso do familiar serão mantidos.',
            )}
          </Typography>
          {remove.isError && (
            <Alert severity="error">{errorMessage(remove.error)}</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={remove.isPending} onClick={() => setRemoving(null)}>
            {translate('Cancelar')}
          </Button>
          <Button
            color="error"
            disabled={remove.isPending}
            onClick={() => removing && remove.mutate(removing)}
          >
            {translate('Confirmar remoção')}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
