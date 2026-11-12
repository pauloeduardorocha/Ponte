import { t as translate, useLocale } from '../../i18n';
import { LocalizedTextField as TextField } from '../../components/LocalizedTextField';
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
} from '@mui/material';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, QueryError } from '../../components/PageParts';
import { errorMessage } from '../../lib/errors';
import { createMember, getMember, updateMember } from '../../lib/members-api';
import type { Member, MemberInput } from '../../lib/types';
import { nameSchema, emailSchema } from '../../lib/validation';

const memberSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .max(32, {
      error: () => translate('O telefone deve ter no máximo 32 caracteres.'),
    }),
  iban: z
    .string()
    .transform((value) => value.replace(/\s/g, '').toUpperCase())
    .pipe(
      z
        .string()
        .max(34, {
          error: () => translate('O IBAN deve ter no máximo 34 caracteres.'),
        })
        .regex(/^$|^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/, {
          error: () => translate('Informe um IBAN válido.'),
        }),
    ),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  birthDate: z.union([
    z.literal(''),
    z.iso.date(translate('Informe uma data válida.')),
  ]),
  notes: z
    .string()
    .trim()
    .max(2000, {
      error: () =>
        translate('As observações devem ter no máximo 2000 caracteres.'),
    }),
});

type MemberFields = z.infer<typeof memberSchema>;

const OPTIONAL_FIELDS = [
  'email',
  'phone',
  'iban',
  'birthDate',
  'notes',
] as const;

function toFields(member?: Member): MemberFields {
  return {
    name: member?.name ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    iban: member?.iban ?? '',
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
  useLocale();
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
      await queryClient.invalidateQueries({
        queryKey: ['community', 'birthdays'],
      });
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
            {error && <Alert severity="error">{translate(error ?? '')}</Alert>}
            <Box className="form-grid">
              <TextField
                label={translate('Nome')}
                required
                error={Boolean(formState.errors.name)}
                helperText={translate(formState.errors.name?.message ?? '')}
                {...register('name')}
              />
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <TextField
                    select
                    label={translate('Status')}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    inputRef={field.ref}
                  >
                    <MenuItem value="ACTIVE">{translate('Ativo')}</MenuItem>
                    <MenuItem value="INACTIVE">{translate('Inativo')}</MenuItem>
                  </TextField>
                )}
              />
              <TextField
                label={translate('E-mail')}
                required
                type="email"
                error={Boolean(formState.errors.email)}
                helperText={translate(formState.errors.email?.message ?? '')}
                {...register('email')}
              />
              <TextField
                label={translate('Telefone')}
                type="tel"
                error={Boolean(formState.errors.phone)}
                helperText={translate(formState.errors.phone?.message ?? '')}
                {...register('phone')}
              />
              <TextField
                label="IBAN"
                error={Boolean(formState.errors.iban)}
                helperText={translate(formState.errors.iban?.message ?? '')}
                {...register('iban')}
              />
              <TextField
                label={translate('Data de nascimento')}
                type="date"
                error={Boolean(formState.errors.birthDate)}
                helperText={translate(
                  formState.errors.birthDate?.message ?? '',
                )}
                slotProps={{ inputLabel: { shrink: true } }}
                {...register('birthDate')}
              />
            </Box>
            <TextField
              label={translate('Observações')}
              error={Boolean(formState.errors.notes)}
              helperText={translate(formState.errors.notes?.message ?? '')}
              multiline
              minRows={3}
              {...register('notes')}
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                component={RouterLink}
                to={member ? `/members/${member.id}` : '/members'}
              >
                {translate('Cancelar')}
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={save.isPending}
              >
                {isEdit
                  ? translate('Salvar alterações')
                  : translate('Cadastrar membro')}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}

export function MemberCreatePage() {
  useLocale();
  const navigate = useNavigate();
  return (
    <Stack spacing={3}>
      <PageHeader
        title={translate('Novo membro')}
        subtitle={translate('Preencha os dados para cadastrar um membro.')}
      />
      <MemberForm
        onSaved={(member) =>
          navigate(`/members/${member.id}`, {
            replace: true,
            state: { notice: translate('Membro cadastrado com sucesso.') },
          })
        }
      />
    </Stack>
  );
}

export function MemberEditPage() {
  useLocale();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const member = useQuery({
    queryKey: ['member', id],
    queryFn: () => getMember(id),
  });

  return (
    <Stack spacing={3}>
      <PageHeader
        title={translate('Editar membro')}
        subtitle={member.data?.name}
      />
      {member.isPending && (
        <CircularProgress aria-label={translate('Carregando')} />
      )}
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
              state: { notice: translate('Membro atualizado com sucesso.') },
            })
          }
        />
      )}
    </Stack>
  );
}
