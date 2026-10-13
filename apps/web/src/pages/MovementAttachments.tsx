import { useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getAccessToken } from '../lib/api';

type Attachment = { id: string; filename: string; size: number };
async function requestFile(path: string, options?: RequestInit) {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? '/api/v1'}/finance/banking${path}`,
    {
      ...options,
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    },
  );
  if (!response.ok) {
    let message = 'Não foi possível processar o anexo.';
    try {
      const data = await response.json();
      message = Array.isArray(data.message)
        ? data.message.join(', ')
        : (data.message ?? message);
    } catch {
      /* non-JSON error */
    }
    throw new Error(message);
  }
  return response;
}

export function MovementAttachments({
  transactionId,
}: {
  transactionId: string;
}) {
  const client = useQueryClient();
  const mobile = useMediaQuery('(pointer: coarse)');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Attachment | null>(null);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const [name, setName] = useState('');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const key = ['banking', 'attachments', transactionId];
  const attachments = useQuery({
    queryKey: key,
    queryFn: () =>
      apiRequest<Attachment[]>(
        `/finance/banking/transactions/${transactionId}/attachments`,
      ),
  });
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      setProgress({ completed: 0, total: files.length });
      for (const file of files) {
        const body = new FormData();
        body.append('file', file);
        await requestFile(`/transactions/${transactionId}/attachments`, {
          method: 'POST',
          body,
        });
        setProgress((previous) => ({
          ...previous,
          completed: previous.completed + 1,
        }));
      }
    },
    onError: (e: Error) => setError(e.message),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  const rename = useMutation({
    mutationFn: ({
      attachment,
      filename,
    }: {
      attachment: Attachment;
      filename: string;
    }) =>
      apiRequest(
        `/finance/banking/transactions/${transactionId}/attachments/${attachment.id}`,
        { method: 'PATCH', body: { filename } },
      ),
    onSuccess: () => setEditing(null),
    onError: (e: Error) => setError(e.message),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: (attachment: Attachment) =>
      apiRequest(
        `/finance/banking/transactions/${transactionId}/attachments/${attachment.id}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => setDeleting(null),
    onError: (e: Error) => setError(e.message),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  const download = useMutation({
    mutationFn: async (attachment: Attachment) => {
      const response = await requestFile(
        `/transactions/${transactionId}/attachments/${attachment.id}/download`,
      );
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onError: (e: Error) => setError(e.message),
  });
  const busy =
    upload.isPending ||
    rename.isPending ||
    remove.isPending ||
    download.isPending;
  const extension =
    editing?.filename.slice(editing.filename.lastIndexOf('.')) ?? '';
  function select(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    const selected = Array.from(files);
    if (selected.length + (attachments.data?.length ?? 0) > 5) {
      setError('Cada movimento permite até 5 anexos.');
      return;
    }
    if (selected.some((file) => file.size < 1 || file.size > 1024 * 1024)) {
      setError('Cada arquivo deve ter entre 1 byte e 1 MB.');
      return;
    }
    if (
      selected.some(
        (file) =>
          !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type),
      )
    ) {
      setError('Selecione PDF ou imagem JPEG/PNG.');
      return;
    }
    upload.mutate(selected);
  }
  const disabled =
    attachments.isPending ||
    !!attachments.error ||
    busy ||
    (attachments.data?.length ?? 0) >= 5;
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">
        Anexos ({attachments.data?.length ?? 0}/5)
      </Typography>
      <Typography variant="caption">
        PDF ou imagem JPEG/PNG · até 1 MB por arquivo
      </Typography>
      {attachments.isFetching && (
        <LinearProgress aria-label="Carregando anexos" />
      )}
      {upload.isPending && (
        <Stack spacing={1} role="status">
          <Typography variant="caption">
            Enviando arquivos: {progress.completed} de {progress.total}{' '}
            concluídos
          </Typography>
          <LinearProgress aria-label="Enviando anexos" />
        </Stack>
      )}
      {(error || attachments.error) && (
        <Alert severity="error">{error || attachments.error?.message}</Alert>
      )}
      <Stack direction="row" spacing={1}>
        <Button component="label" disabled={disabled}>
          {upload.isPending && <CircularProgress size={16} sx={{ mr: 1 }} />}
          {upload.isPending ? 'Enviando…' : 'Adicionar arquivos'}
          <input
            hidden
            aria-label="Selecionar anexos"
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => {
              select(e.target.files);
              e.target.value = '';
            }}
          />
        </Button>
        {mobile && (
          <Button component="label" disabled={disabled}>
            Tirar foto
            <input
              hidden
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              onChange={(e) => {
                select(e.target.files);
                e.target.value = '';
              }}
            />
          </Button>
        )}
      </Stack>
      {attachments.data?.map((attachment) => (
        <Stack
          key={attachment.id}
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
        >
          <Button
            disabled={busy}
            sx={{ justifyContent: 'flex-start', overflowWrap: 'anywhere' }}
            onClick={() => {
              setError('');
              download.mutate(attachment);
            }}
          >
            {download.isPending && download.variables?.id === attachment.id && (
              <CircularProgress
                size={16}
                aria-label="Baixando anexo"
                sx={{ mr: 1 }}
              />
            )}
            {attachment.filename}
          </Button>
          <Button
            disabled={busy}
            aria-label={`Renomear ${attachment.filename}`}
            onClick={() => {
              setError('');
              setEditing(attachment);
              setName(
                attachment.filename.slice(
                  0,
                  attachment.filename.lastIndexOf('.'),
                ),
              );
            }}
          >
            Renomear
          </Button>
          <Button
            disabled={busy}
            color="error"
            aria-label={`Excluir ${attachment.filename}`}
            onClick={() => {
              setError('');
              setDeleting(attachment);
            }}
          >
            Excluir
          </Button>
        </Stack>
      ))}
      <Dialog
        open={!!editing}
        onClose={() => {
          if (!rename.isPending) setEditing(null);
        }}
        fullWidth
        maxWidth="xs"
        aria-labelledby="rename-attachment-title"
      >
        <DialogTitle id="rename-attachment-title">Renomear anexo</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Nome do arquivo"
            value={name}
            disabled={rename.isPending}
            onChange={(e) => setName(e.target.value)}
            helperText={`A extensão ${extension} será mantida.`}
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={rename.isPending} onClick={() => setEditing(null)}>
            Cancelar
          </Button>
          <Button
            disabled={rename.isPending || !name.trim()}
            onClick={() => {
              if (editing) {
                setError('');
                rename.mutate({
                  attachment: editing,
                  filename: name.trim() + extension,
                });
              }
            }}
          >
            {rename.isPending && (
              <CircularProgress
                size={16}
                aria-label="Renomeando anexo"
                sx={{ mr: 1 }}
              />
            )}
            {rename.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!deleting}
        onClose={() => {
          if (!remove.isPending) setDeleting(null);
        }}
        aria-labelledby="delete-attachment-title"
      >
        <DialogTitle id="delete-attachment-title">Excluir anexo?</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography>
            O arquivo {deleting?.filename} será excluído deste movimento.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={remove.isPending} onClick={() => setDeleting(null)}>
            Cancelar
          </Button>
          <Button
            color="error"
            disabled={remove.isPending}
            onClick={() => {
              if (deleting) {
                setError('');
                remove.mutate(deleting);
              }
            }}
          >
            {remove.isPending && (
              <CircularProgress
                size={16}
                aria-label="Excluindo anexo"
                sx={{ mr: 1 }}
              />
            )}
            {remove.isPending ? 'Excluindo…' : 'Excluir anexo'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
