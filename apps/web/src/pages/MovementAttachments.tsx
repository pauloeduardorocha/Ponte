import { t as translate, useLocale } from '../i18n';
import { DocumentGallery } from '../components/DocumentGallery';
import { MovementReimbursement } from './reimbursements/ReimbursementDocuments';
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
    `${import.meta.env.VITE_API_URL ?? '/api/v1'}${path}`,
    {
      ...options,
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    },
  );
  if (!response.ok) {
    let message = translate('Não foi possível processar o anexo.');
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
  expenseId,
  canWrite = true,
  canRead = true,
  onReimbursementLinked,
  showReimbursement = true,
}: {
  transactionId?: string;
  expenseId?: string;
  canWrite?: boolean;
  canRead?: boolean;
  showReimbursement?: boolean;
  onReimbursementLinked?: (categoryId: string) => void;
}) {
  useLocale();
  const client = useQueryClient();
  const mobile = useMediaQuery('(pointer: coarse)');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Attachment | null>(null);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const [name, setName] = useState('');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const listPath = expenseId
    ? `/finance/expenses/${expenseId}/attachments`
    : `/finance/banking/transactions/${transactionId}/attachments`;
  const filePath = (id: string) =>
    expenseId ? `/finance/attachments/${id}` : `${listPath}/${id}`;
  const maxMb = expenseId ? 10 : 1;
  const maxFiles = expenseId ? Infinity : 5;
  const key = ['finance', 'attachments', listPath];
  const attachments = useQuery({
    enabled: canRead,
    queryKey: key,
    queryFn: () => apiRequest<Attachment[]>(listPath),
  });
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      setProgress({ completed: 0, total: files.length });
      for (const file of files) {
        const body = new FormData();
        body.append('file', file);
        await requestFile(listPath, {
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
    onSettled: () => client.invalidateQueries({ queryKey: ['finance'] }),
  });
  const rename = useMutation({
    mutationFn: ({
      attachment,
      filename,
    }: {
      attachment: Attachment;
      filename: string;
    }) =>
      apiRequest(filePath(attachment.id), {
        method: 'PATCH',
        body: { filename },
      }),
    onSuccess: () => setEditing(null),
    onError: (e: Error) => setError(e.message),
    onSettled: () => client.invalidateQueries({ queryKey: ['finance'] }),
  });
  const remove = useMutation({
    mutationFn: (attachment: Attachment) =>
      apiRequest(filePath(attachment.id), { method: 'DELETE' }),
    onSuccess: () => setDeleting(null),
    onError: (e: Error) => setError(e.message),
    onSettled: () => client.invalidateQueries({ queryKey: ['finance'] }),
  });
  const busy = upload.isPending || rename.isPending || remove.isPending;
  const extension =
    editing?.filename.slice(editing.filename.lastIndexOf('.')) ?? '';
  function select(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    const selected = Array.from(files);
    if (selected.length + (attachments.data?.length ?? 0) > maxFiles) {
      setError(translate('Cada movimento permite até 5 anexos.'));
      return;
    }
    if (
      selected.some((file) => file.size < 1 || file.size > maxMb * 1024 * 1024)
    ) {
      setError(
        translate('Cada arquivo deve ter entre 1 byte e {0} MB.', [maxMb]),
      );
      return;
    }
    if (
      selected.some(
        (file) =>
          !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type),
      )
    ) {
      setError(translate('Selecione PDF ou imagem JPEG/PNG.'));
      return;
    }
    upload.mutate(selected);
  }
  const disabled =
    (canRead && attachments.isPending) ||
    !!attachments.error ||
    busy ||
    !canWrite ||
    (attachments.data?.length ?? 0) >= maxFiles;
  return (
    <Stack spacing={1}>
      {transactionId && canRead && showReimbursement && (
        <MovementReimbursement
          transactionId={transactionId}
          onLinked={onReimbursementLinked}
        />
      )}
      <Typography variant="subtitle2">
        {translate('Anexos (')}
        {attachments.data?.length ?? 0}
        {expenseId ? '' : '/5'})
      </Typography>
      <Typography variant="caption">
        {translate('PDF ou imagem JPEG/PNG · até ')}
        {maxMb} {translate(' MB por arquivo')}
      </Typography>
      {attachments.isFetching && (
        <LinearProgress aria-label={translate('Carregando anexos')} />
      )}
      {upload.isPending && (
        <Stack spacing={1} role="status">
          <Typography variant="caption">
            {translate('Enviando arquivos: ')}
            {progress.completed} {translate(' de ')}
            {progress.total} {translate('concluídos')}
          </Typography>
          <LinearProgress aria-label={translate('Enviando anexos')} />
        </Stack>
      )}
      {(error || attachments.error) && (
        <Alert severity="error">{error || attachments.error?.message}</Alert>
      )}
      <Stack direction="row" spacing={1}>
        <Button component="label" disabled={disabled}>
          {upload.isPending && <CircularProgress size={16} sx={{ mr: 1 }} />}
          {upload.isPending
            ? translate('Enviando…')
            : translate('Adicionar arquivos')}
          <input
            hidden
            aria-label={translate('Selecionar anexos')}
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
            {translate('Tirar foto')}
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
      <DocumentGallery
        disabled={busy}
        documents={(attachments.data ?? []).map((attachment) => ({
          ...attachment,
          path: `${filePath(attachment.id)}/download`,
        }))}
        actions={(document) => (
          <>
            <Button
              disabled={busy || !canWrite}
              aria-label={translate('Renomear {0}', [document.filename])}
              onClick={() => {
                setError('');
                setEditing(document as Attachment);
                setName(
                  document.filename.slice(
                    0,
                    document.filename.lastIndexOf('.'),
                  ),
                );
              }}
            >
              {translate('Renomear')}
            </Button>
            <Button
              disabled={busy || !canWrite}
              color="error"
              aria-label={translate('Excluir {0}', [document.filename])}
              onClick={() => {
                setError('');
                setDeleting(document as Attachment);
              }}
            >
              {translate('Excluir')}
            </Button>
          </>
        )}
      />
      <Dialog
        open={!!editing}
        onClose={() => {
          if (!rename.isPending) setEditing(null);
        }}
        fullWidth
        maxWidth="xs"
        aria-labelledby="rename-attachment-title"
      >
        <DialogTitle id="rename-attachment-title">
          {translate('Renomear anexo')}
        </DialogTitle>
        <DialogContent>
          {error && <Alert severity="error">{translate(error ?? '')}</Alert>}
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label={translate('Nome do arquivo')}
            value={name}
            disabled={rename.isPending}
            onChange={(e) => setName(e.target.value)}
            helperText={translate('A extensão {0} será mantida.', [extension])}
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={rename.isPending} onClick={() => setEditing(null)}>
            {translate('Cancelar')}
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
                aria-label={translate('Renomeando anexo')}
                sx={{ mr: 1 }}
              />
            )}
            {rename.isPending ? translate('Salvando…') : translate('Salvar')}
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
        <DialogTitle id="delete-attachment-title">
          {translate('Excluir anexo?')}
        </DialogTitle>
        <DialogContent>
          {error && <Alert severity="error">{translate(error ?? '')}</Alert>}
          <Typography>
            {translate('O arquivo ')}
            {deleting?.filename} {translate(' será excluído deste movimento.')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={remove.isPending} onClick={() => setDeleting(null)}>
            {translate('Cancelar')}
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
                aria-label={translate('Excluindo anexo')}
                sx={{ mr: 1 }}
              />
            )}
            {remove.isPending
              ? translate('Excluindo…')
              : translate('Excluir anexo')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
