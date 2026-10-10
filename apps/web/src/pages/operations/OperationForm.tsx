import { useState } from 'react';
import { useForm, Controller, type Control } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useAuth } from '../../auth/auth-context';
import { apiRequest } from '../../lib/api';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import {
  configs,
  dayLabels,
  entryName,
  operationLabels,
  type Entry,
  type Field,
} from './operation-config';
type Values = Record<string, string | boolean>;
export function LookupField({
  field,
  control,
  initial,
}: {
  field: Field;
  control: Control<Values>;
  initial?: Entry;
}) {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const permitted =
    field.lookup === 'people'
      ? true
      : field.lookup === 'assignees'
        ? hasPermission('FOLLOWUP_READ')
        : field.lookup
          ? hasPermission(configs[field.lookup].read)
          : false;
  const data = useQuery({
    queryKey: ['operations', 'lookup', field.lookup, debounced],
    queryFn: () =>
      apiRequest<{ items: Entry[] }>(`/operations/${field.lookup}`, {
        query: { search: debounced, pageSize: 100 },
      }),
    enabled: permitted,
  });
  const relation = field.key
    .replace(/Id$/, '')
    .replace(/^recipient/, 'recipient');
  const initialEntry = initial?.[relation] as Entry | undefined;
  const options = data.data?.items ?? [];
  return (
    <Controller
      name={field.key}
      control={control}
      rules={{ required: field.required ? 'Selecione uma opção' : false }}
      render={({ field: input, fieldState }) => (
        <Autocomplete
          options={options}
          value={
            options.find((o) => o.id === input.value) ??
            (input.value
              ? {
                  id: String(input.value),
                  name: initialEntry?.name ?? 'Seleção atual',
                }
              : null)
          }
          getOptionLabel={entryName}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          filterOptions={(o) => o}
          onInputChange={(_, v, reason) => {
            if (reason === 'input') setSearch(v);
          }}
          onChange={(_, v) => input.onChange(v?.id ?? '')}
          loading={data.isFetching}
          disabled={!permitted}
          noOptionsText={
            permitted
              ? 'Nenhum resultado. Pesquise por nome.'
              : 'Sem permissão para consultar opções'
          }
          renderInput={(p) => (
            <TextField
              {...p}
              label={field.label}
              required={field.required}
              error={!!fieldState.error || data.isError}
              helperText={
                fieldState.error?.message ??
                (data.isError ? 'Falha ao carregar opções' : undefined)
              }
            />
          )}
        />
      )}
    />
  );
}
export function OperationForm({
  title,
  path,
  method = 'POST',
  fields,
  initial,
  onClose,
  onSaved,
}: {
  title: string;
  path: string;
  method?: 'POST' | 'PATCH';
  fields: Field[];
  initial?: Entry;
  onClose: () => void;
  onSaved: (result?: unknown) => void;
}) {
  const defaults: Values = {};
  for (const f of fields) {
    const value = initial?.[f.key];
    if (f.type === 'boolean')
      defaults[f.key] = typeof value === 'boolean' ? value : f.key === 'active';
    else if (value && f.type === 'datetime-local') {
      const d = new Date(String(value));
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      defaults[f.key] = d.toISOString().slice(0, 16);
    } else if (value && f.type === 'date')
      defaults[f.key] = String(value).slice(0, 10);
    else
      defaults[f.key] = String(
        value ??
          (f.key === 'gender' || f.key === 'ticketId' ? '' : f.options?.[0]) ??
          (f.type === 'date' ? new Date().toISOString().slice(0, 10) : ''),
      );
  }
  const form = useForm<Values>({ defaultValues: defaults });
  const client = useQueryClient();
  const [confirmation, setConfirmation] = useState<Values>();
  const save = useMutation({
    mutationFn: (values: Values) => {
      const body: Record<string, unknown> = {};
      for (const f of fields) {
        const value = values[f.key];
        if (value === '') {
          if (
            method === 'PATCH' &&
            path.startsWith('/operations/visitors/') &&
            [
              'email',
              'phone',
              'birthDate',
              'gender',
              'howDidYouHear',
              'invitedByMemberId',
              'notes',
            ].includes(f.key)
          )
            body[f.key] = null;
          continue;
        }
        body[f.key] =
          f.type === 'number' || f.key === 'meetingDay'
            ? Number(value)
            : f.type === 'datetime-local'
              ? new Date(String(value)).toISOString()
              : value;
      }
      return apiRequest(path, { method, body });
    },
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ['operations'] });
      void client.invalidateQueries({ queryKey: ['community'] });
      onSaved(result);
    },
  });
  return (
    <>
      <Dialog
        open
        fullWidth
        maxWidth="sm"
        onClose={() => {
          if (!save.isPending) onClose();
        }}
      >
        <form
          onSubmit={form.handleSubmit((v) => {
            if (v.status === 'CANCELLED' || v.active === false)
              setConfirmation(v);
            else save.mutate(v);
          })}
        >
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {save.isError && (
                <Alert severity="error">{save.error.message}</Alert>
              )}
              {fields.some((f) => f.key === 'visitorId') &&
                fields.some((f) => f.key === 'memberId') && (
                  <Alert severity="info">
                    Selecione um membro ou um visitante.
                  </Alert>
                )}
              {fields.map((f) =>
                f.lookup ? (
                  <LookupField
                    key={f.key}
                    field={f}
                    control={form.control}
                    initial={initial}
                  />
                ) : f.type === 'boolean' ? (
                  <Controller
                    key={f.key}
                    name={f.key}
                    control={form.control}
                    render={({ field }) => (
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={Boolean(field.value)}
                            onChange={(_, v) => field.onChange(v)}
                          />
                        }
                        label={f.label}
                      />
                    )}
                  />
                ) : (
                  <TextField
                    key={f.key}
                    label={f.label}
                    select={!!f.options}
                    required={f.required}
                    type={f.type === 'textarea' ? undefined : f.type}
                    multiline={f.type === 'textarea'}
                    minRows={f.type === 'textarea' ? 3 : undefined}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: {
                        maxLength:
                          f.key === 'content'
                            ? 5000
                            : f.type === 'textarea'
                              ? 2000
                              : 320,
                        min: f.type === 'number' ? 1 : undefined,
                      },
                    }}
                    {...form.register(f.key, {
                      required: f.required ? 'Preencha este campo' : false,
                      validate: (v) =>
                        !f.required ||
                        typeof v !== 'string' ||
                        !!v.trim() ||
                        'Preencha este campo',
                    })}
                    error={!!form.formState.errors[f.key]}
                    helperText={form.formState.errors[f.key]?.message}
                  >
                    {f.options && !f.required && (
                      <MenuItem value="">Não informado</MenuItem>
                    )}
                    {f.options?.map((o) => (
                      <MenuItem key={o} value={o}>
                        {f.key === 'meetingDay'
                          ? dayLabels[Number(o)]
                          : (f.optionLabels?.[o] ?? operationLabels[o] ?? o)}
                      </MenuItem>
                    ))}
                  </TextField>
                ),
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button disabled={save.isPending} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog open={!!confirmation} onClose={() => setConfirmation(undefined)}>
        <DialogTitle>Confirmar cancelamento ou inativação?</DialogTitle>
        <DialogContent>O histórico será preservado.</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmation(undefined)}>Voltar</Button>
          <Button
            color="error"
            onClick={() => {
              if (confirmation) save.mutate(confirmation);
              setConfirmation(undefined);
            }}
          >
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
