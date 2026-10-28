import { LocalizedTextField as TextField } from '../../components/LocalizedTextField';
import { EntitySelect } from '../../components/EntitySelect';
import { LibraryMultiAutocomplete } from '../../components/LibraryMultiAutocomplete';
import { STATUS_LABELS } from '../../lib/status-labels';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import { errorMessage } from '../../lib/errors';
import { type Action } from './library-actions';
export function ActionDialog({
  action,
  close,
  onSaved,
}: {
  action: Action;
  close: () => void;
  onSaved: () => void;
}) {
  const { control, handleSubmit } = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(
      action.fields.map((field) => [
        field.name,
        action.values?.[field.name] ?? '',
      ]),
    ),
  });
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: Record<string, string>) => action.run(values),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['library'] });
      await client.invalidateQueries({ queryKey: ['entity-options'] });
      onSaved();
      close();
    },
  });
  return (
    <Dialog
      open
      onClose={() => {
        if (!mutation.isPending) close();
      }}
      fullWidth
      maxWidth="sm"
    >
      <Box
        component="form"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
      >
        <DialogTitle>{action.title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {mutation.isError && (
              <Alert severity="error">{errorMessage(mutation.error)}</Alert>
            )}
            {!action.fields.length && (
              <Typography>Confirma esta operação?</Typography>
            )}
            {action.fields.map((field) => (
              <Controller
                key={field.name}
                name={field.name}
                control={control}
                rules={{
                  required: field.required ? 'Campo obrigatório' : false,
                }}
                render={({ field: input, fieldState }) =>
                  field.multiple && field.endpoint ? (
                    <LibraryMultiAutocomplete
                      {...input}
                      inputRef={input.ref}
                      endpoint={field.endpoint}
                      label={field.label}
                      freeSolo={field.freeSolo}
                      disabled={mutation.isPending}
                      error={Boolean(fieldState.error)}
                      helperText={fieldState.error?.message}
                    />
                  ) : field.endpoint ? (
                    <EntitySelect
                      {...input}
                      inputRef={input.ref}
                      endpoint={field.endpoint}
                      query={field.query}
                      label={field.label}
                      required={field.required}
                      disabled={mutation.isPending}
                      error={Boolean(fieldState.error)}
                      helperText={fieldState.error?.message}
                    />
                  ) : (
                    <TextField
                      {...input}
                      inputRef={input.ref}
                      label={field.label}
                      required={field.required}
                      type={field.type ?? 'text'}
                      multiline={field.multiline}
                      minRows={field.multiline ? 2 : undefined}
                      select={Boolean(field.options)}
                      disabled={mutation.isPending}
                      error={Boolean(fieldState.error)}
                      helperText={fieldState.error?.message}
                      slotProps={
                        field.type === 'date'
                          ? { inputLabel: { shrink: true } }
                          : undefined
                      }
                    >
                      {field.options?.map((option) => (
                        <MenuItem key={option} value={option}>
                          {STATUS_LABELS[option] ??
                            (option === 'true'
                              ? 'Sim'
                              : option === 'false'
                                ? 'Não'
                                : option)}
                        </MenuItem>
                      ))}
                    </TextField>
                  )
                }
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={mutation.isPending} onClick={close}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={mutation.isPending}
          >
            Confirmar
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
