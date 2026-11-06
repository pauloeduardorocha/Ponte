import { errorMessage } from './conversation-utils';
import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { CachedQueryStatus } from './CachedQueryStatus';
import { ConversationComposer } from './ConversationContent';
import type { ConversationPageView as Page } from '@church/shared';
function ConversationBoard({ all = false }: { all?: boolean }) {
  const [create, setCreate] = useState(false);
  const navigate = useNavigate();
  const client = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: ['conversations', 'list'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiRequest<Page>('/conversations', { query: { page: pageParam } }),
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length : undefined,
  });
  const posts = [
    ...new Map(
      list.data?.pages
        .flatMap((page) => page.items)
        .map((post) => [post.id, post]),
    ).values(),
  ];
  return (
    <Stack
      spacing={2}
      component="section"
      aria-label="Painéis de conversas"
      sx={{ minWidth: 0 }}
    >
      {all && (
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap={1}
        >
          <Typography variant="h4" component="h1">
            Mural
          </Typography>
          <Button variant="contained" onClick={() => setCreate(true)}>
            Nova conversa
          </Button>
        </Stack>
      )}
      {all && (
        <CachedQueryStatus
          updatedAt={list.dataUpdatedAt}
          refreshing={list.isFetching}
          onRefresh={() => void list.refetch()}
          label="conversas"
        />
      )}
      {list.isPending && <CircularProgress aria-label="Carregando conversas" />}
      {list.isError && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void list.refetch()}>
              Tentar novamente
            </Button>
          }
        >
          {errorMessage(list.error)}
        </Alert>
      )}
      {list.data?.pages[0]?.items.length === 0 && (
        <Alert severity="info">Comece uma conversa com a comunidade.</Alert>
      )}
      <Box
        sx={{
          display: all ? 'grid' : 'flex',
          gridTemplateColumns: all
            ? {
                xs: 'minmax(0, 1fr)',
                sm: 'repeat(2, minmax(0, 1fr))',
                lg: 'repeat(3, minmax(0, 1fr))',
              }
            : undefined,
          gap: 2,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          pb: 1,
        }}
      >
        {(all ? posts : posts.slice(0, 20)).map((post) => (
          <Card
            key={post.id}
            variant="outlined"
            sx={{
              flex: '0 0 min(300px, 80vw)',
              minWidth: 0,
              scrollSnapAlign: 'start',
              borderRadius: 3,
            }}
          >
            <CardActionArea
              component={Link}
              role="link"
              to={`/conversations/${post.id}`}
              sx={{ height: '100%' }}
            >
              <CardContent>
                <Stack spacing={1}>
                  <Typography
                    variant="h6"
                    component={all ? 'h2' : 'h3'}
                    sx={{ overflowWrap: 'anywhere' }}
                  >
                    {post.deletedAt ? 'conversa excluída' : post.title}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Avatar
                      src={post.author.avatar ?? undefined}
                      alt={post.author.name}
                      sx={{ width: 32, height: 32 }}
                    >
                      {post.author.name.charAt(0).toLocaleUpperCase('pt-PT')}
                    </Avatar>
                    <Typography variant="body2">
                      {post.author.name} · {formatDateTime(post.createdAt)}
                    </Typography>
                  </Stack>
                  {!post.deletedAt && (
                    <Typography
                      color="text.secondary"
                      sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {post.body.replace(
                        /@\[([^\]]+)\]\([0-9a-f-]{36}\)/gi,
                        '@$1',
                      )}
                    </Typography>
                  )}
                  <Typography variant="caption">
                    {post._count?.replies ?? 0} respostas
                  </Typography>
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
      {!all && (
        <Typography
          component={Link}
          to="/conversations"
          variant="body2"
          color="primary"
          sx={{ alignSelf: 'flex-start' }}
        >
          Ver mural
        </Typography>
      )}
      {all && list.hasNextPage && (
        <Button
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Carregar mais conversas
        </Button>
      )}
      <Dialog
        open={create}
        onClose={() => setCreate(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="new-conversation"
      >
        <DialogTitle id="new-conversation">Nova conversa</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <ConversationComposer
              onSaved={(id) => {
                void client.invalidateQueries({
                  queryKey: ['conversations', 'list'],
                });
                setCreate(false);
                navigate(`/conversations/${id}`);
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreate(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export function ConversationsCarousel() {
  return <ConversationBoard />;
}
export function ConversationsPage() {
  return (
    <Stack spacing={2}>
      <Button component={Link} to="/" sx={{ alignSelf: 'flex-start' }}>
        Voltar para o início
      </Button>
      <ConversationBoard all />
    </Stack>
  );
}
