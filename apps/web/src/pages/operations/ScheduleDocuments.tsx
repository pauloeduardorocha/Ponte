import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogActions,
  Stack,
  Typography,
} from '@mui/material';
import { apiRequest } from '../../lib/api';
import {
  DocumentGallery,
  type PreviewDocument,
} from '../../components/DocumentGallery';
export function ScheduleDocuments({
  id,
  canManage,
  onDeleted,
}: {
  id: string;
  canManage: boolean;
  onDeleted: () => void;
}) {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [removal, setRemoval] = useState<{ path: string; schedule: boolean }>();
  const path = `/operations/schedules/${id}`;
  const files = useQuery({
    queryKey: ['operations', 'attachments', id],
    queryFn: () => apiRequest<PreviewDocument[]>(`${path}/attachments`),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const chunkSize = 2 * 1024 * 1024;
      const send = (blob: Blob, endpoint: string) => {
        const body = new FormData();
        body.append('file', blob, file.name);
        return apiRequest<{ id: string }>(endpoint, { method: 'POST', body });
      };
      if (file.size <= chunkSize) return send(file, `${path}/attachments`);
      const attachment = await send(
        file.slice(0, chunkSize, file.type),
        `${path}/attachments/chunks/${file.size}`,
      );
      try {
        for (let offset = chunkSize; offset < file.size; offset += chunkSize)
          await send(
            file.slice(
              offset,
              Math.min(offset + chunkSize, file.size),
              file.type,
            ),
            `${path}/attachments/${attachment.id}/chunks/${offset}`,
          );
      } catch (error) {
        await apiRequest(`${path}/attachments/${attachment.id}`, {
          method: 'DELETE',
        }).catch(() => undefined);
        throw error;
      }
      return attachment;
    },
    onSuccess: () => {
      setError('');
      void client.invalidateQueries({
        queryKey: ['operations', 'attachments', id],
      });
    },
  });
  const remove = useMutation({
    mutationFn: (target: { path: string; schedule: boolean }) =>
      apiRequest(target.path, { method: 'DELETE' }),
    onSuccess: (_, target) => {
      setRemoval(undefined);
      void client.invalidateQueries({ queryKey: ['operations'] });
      if (target.schedule) onDeleted();
    },
  });
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Anexos da escala</Typography>
      <Typography variant="body2">
        Visíveis a todos os membros do ministério. Até 5 MB por arquivo. Imagens
        e PDFs têm pré-visualização.
      </Typography>
      {(error || upload.error || remove.error || files.error) && (
        <Alert severity="error">
          {error ||
            upload.error?.message ||
            remove.error?.message ||
            files.error?.message}
        </Alert>
      )}
      {canManage && (
        <Button component="label" disabled={upload.isPending}>
          {' '}
          {upload.isPending ? 'A enviar…' : 'Anexar arquivo'}
          <input
            hidden
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              if (!file.size || file.size > 5 * 1024 * 1024) {
                setError('Selecione um arquivo de até 5 MB.');
                return;
              }
              upload.mutate(file);
            }}
          />
        </Button>
      )}
      {files.isPending && <Typography>A carregar anexos…</Typography>}
      {files.data?.length === 0 && (
        <Typography>Nenhum anexo nesta escala.</Typography>
      )}
      <DocumentGallery
        documents={(files.data ?? []).map((file) => ({
          ...file,
          path: `${path}/attachments/${file.id}`,
          ranged: true,
        }))}
        actions={
          canManage
            ? (file) => (
                <Button
                  color="error"
                  disabled={remove.isPending}
                  onClick={() =>
                    setRemoval({
                      path: `${path}/attachments/${file.id}`,
                      schedule: false,
                    })
                  }
                >
                  Excluir arquivo
                </Button>
              )
            : undefined
        }
      />
      {canManage && (
        <Button
          color="error"
          onClick={() => setRemoval({ path, schedule: true })}
        >
          Excluir escala
        </Button>
      )}
      <Dialog open={!!removal} onClose={() => setRemoval(undefined)}>
        <DialogTitle>
          {removal?.schedule
            ? 'Excluir escala e todos os seus anexos?'
            : 'Excluir este arquivo?'}
        </DialogTitle>
        <DialogActions>
          <Button onClick={() => setRemoval(undefined)}>Voltar</Button>
          <Button
            color="error"
            disabled={remove.isPending}
            onClick={() => removal && remove.mutate(removal)}
          >
            Excluir
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
