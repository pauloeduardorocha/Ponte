import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, QueryError } from '../../components/PageParts';
import { errorMessage } from '../../lib/errors';
import { createMember, getMember, updateMember } from '../../lib/members-api';
import type { Member, MemberInput } from '../../lib/types';
import { nameSchema } from '../../lib/validation';

const memberSchema = z.object({
  name: nameSchema,
  email: z.union([
    z.literal(''),
    z
      .string()
      .trim()
      .max(320, 'O e-mail deve ter no máximo 320 caracteres.')
      .pipe(z.email('Informe um e-mail válido.')),
  ]),
  phone: z
    .string()
    .trim()
    .max(32, 'O telefone deve ter no máximo 32 caracteres.'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  birthDate: z.union([z.literal(''), z.iso.date('Informe uma data válida.')]),
  notes: z
    .string()
    .trim()
    .max(2000, 'As observações devem ter no máximo 2000 caracteres.'),
});

type MemberFields = z.infer<typeof memberSchema>;

const OPTIONAL_FIELDS = ['email', 'phone', 'birthDate', 'notes'] as const;

function toFields(member?: Member): MemberFields {
  return {
    name: member?.name ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    status: member?.status ?? 'ACTIVE',
    birthDate: member?.birthDate?.slice(0, 10) ?? '',
    notes: member?.notes ?? '',
  };
}

/**
 * Builds the API payload. On create, empty optional fields are omitted;
 * on update they are sent as null so they can be cleared.
 */
function toInput(values: MemberFields, isEdit: boolean): MemberInput {
  const input: MemberInput = { name: values.name, status: values.status };
  for (const key of OPTIONAL_FIELDS) {
    const value = values[key];
    if (value) {
      input[key] = value;
    } else if (isEdit) {
      input[key] = null;
    }
  }
  return input;
}

function MemberForm({
  member,
  onSaved,
}: {
  member?: Member;
  onSaved: (member: Member) => void;
}) {
  const isEdit = Boolean(member);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { register, control, handleSubmit, formState } = useForm<MemberFields>({
    resolver: zodResolver(memberSchema),
    defaultValues: toFields(member),
  });

  const save = useMutation({
    mutationFn: (input: MemberInput) =>
      member ? updateMember(member.id, input) : createMember(input),
    onSuccess: async (saved) => {
      queryClient.setQueryData(['member', saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      onSaved(saved);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    save.mutate(toInput(values, isEdit));
  });

  return (
    <Card variant="outlined">
      <CardContent>
        <Box component="form" onSubmit={onSubmit} noValidate>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box className="form-grid">
              <TextField
                label="Nome"
                required
                error={Boolean(formState.errors.name)}
                helperText={formState.errors.name?.message}
                {...register('name')}
              />
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <TextField
                    select
                    label="Status"
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    inputRef={field.ref}
                  >
                    <MenuItem value="ACTIVE">Ativo</MenuItem>
                    <MenuItem value="INACTIVE">Inativo</MenuItem>
                  </TextField>
                )}
              />
              <TextField
                label="E-mail"
                type="email"
                error={Boolean(formState.errors.email)}
                helperText={formState.errors.email?.message}
                {...register('email')}
              />
              <TextField
                label="Telefone"
                type="tel"
                error={Boolean(formState.errors.phone)}
                helperText={formState.errors.phone?.message}
                {...register('phone')}
              />
              <TextField
                label="Data de nascimento"
                type="date"
                error={Boolean(formState.errors.birthDate)}
                helperText={formState.errors.birthDate?.message}
                slotProps={{ inputLabel: { shrink: true } }}
                {...register('birthDate')}
              />
            </Box>
            <TextField
              label="Observações"
              error={Boolean(formState.errors.notes)}
              helperText={formState.errors.notes?.message}
              multiline
              minRows={3}
              {...register('notes')}
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                component={RouterLink}
                to={member ? `/members/${member.id}` : '/members'}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={save.isPending}
              >
                {isEdit ? 'Salvar alterações' : 'Cadastrar membro'}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}

export function MemberCreatePage() {
  const navigate = useNavigate();
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Novo membro"
        subtitle="Preencha os dados para cadastrar um membro."
      />
      <MemberForm
        onSaved={(member) =>
          navigate(`/members/${member.id}`, {
            replace: true,
            state: { notice: 'Membro cadastrado com sucesso.' },
          })
        }
      />
    </Stack>
  );
}

export function MemberEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const member = useQuery({
    queryKey: ['member', id],
    queryFn: () => getMember(id),
  });

  return (
    <Stack spacing={3}>
      <PageHeader title="Editar membro" subtitle={member.data?.name} />
      {member.isPending && <CircularProgress aria-label="Carregando" />}
      {member.isError && (
        <QueryError
          error={member.error}
          onRetry={() => void member.refetch()}
        />
      )}
      {member.data && (
        <MemberForm
          key={member.data.id}
          member={member.data}
          onSaved={(saved) =>
            navigate(`/members/${saved.id}`, {
              replace: true,
              state: { notice: 'Membro atualizado com sucesso.' },
            })
          }
        />
      )}
    </Stack>
  );
}
