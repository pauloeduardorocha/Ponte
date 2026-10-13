import { useState } from 'react';
import { Alert, Button, Stack, Typography, useMediaQuery } from '@mui/material';
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
      for (const file of files) {
        const body = new FormData();
        body.append('file', file);
        await requestFile(`/transactions/${transactionId}/attachments`, {
          method: 'POST',
          body,
        });
      }
    },
    onError: (e: Error) => setError(e.message),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
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
    upload.isPending ||
    (attachments.data?.length ?? 0) >= 5;
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">
        Anexos ({attachments.data?.length ?? 0}/5)
      </Typography>
      <Typography variant="caption">
        PDF ou imagem JPEG/PNG · até 1 MB por arquivo
      </Typography>
      {(error || attachments.error) && (
        <Alert severity="error">{error || attachments.error?.message}</Alert>
      )}
      <Stack direction="row" spacing={1}>
        <Button component="label" disabled={disabled}>
          {upload.isPending ? 'Enviando…' : 'Adicionar arquivos'}
          <input
            hidden
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
        <Button
          key={attachment.id}
          sx={{ justifyContent: 'flex-start', overflowWrap: 'anywhere' }}
          onClick={async () => {
            try {
              const response = await requestFile(
                `/transactions/${transactionId}/attachments/${attachment.id}/download`,
              );
              const url = URL.createObjectURL(await response.blob());
              const link = document.createElement('a');
              link.href = url;
              link.download = attachment.filename;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {attachment.filename}
        </Button>
      ))}
    </Stack>
  );
}
