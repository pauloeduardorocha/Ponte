import { errorMessage } from './conversation-utils';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import type { ConversationPostView } from '@church/shared';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../lib/api';

export function ConversationPostActions({
  post,
  topic,
  onDeleted,
}: {
  post: ConversationPostView;
  topic?: boolean;
  onDeleted: () => void;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({
    mutationFn: () =>
      apiRequest(`/conversations/${post.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      client.removeQueries({ queryKey: ['conversations', 'image', post.id] });
      setConfirm(false);
      onDeleted();
    },
  });
  const canDelete =
    user?.id === post.authorId ||
    user?.roles?.some((role) => ['ADMIN', 'SUPER_ADMIN'].includes(role));
  if (post.deletedAt || !canDelete) return null;
  return (
    <>
      <Button
        size="small"
        color="inherit"
        sx={{ color: 'text.secondary' }}
        onClick={() => setConfirm(true)}
      >
        Excluir {topic ? 'conversa' : 'mensagem'}
      </Button>
      {remove.isError && (
        <Alert severity="error">{errorMessage(remove.error)}</Alert>
      )}
      <Dialog
        open={confirm}
        onClose={() => {
          if (!remove.isPending) setConfirm(false);
        }}
        aria-labelledby={`delete-${post.id}`}
      >
        <DialogTitle id={`delete-${post.id}`}>
          Excluir {topic ? 'conversa' : 'mensagem'}?
        </DialogTitle>
        <DialogContent>
          O conteúdo deixará de ser exibido. O registro continuará preservado.
        </DialogContent>
        <DialogActions>
          <Button disabled={remove.isPending} onClick={() => setConfirm(false)}>
            Cancelar
          </Button>
          <Button
            color="error"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Excluir
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
