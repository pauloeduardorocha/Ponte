import { errorMessage, personInitials } from './conversation-utils';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import type { ConversationDetailView } from '@church/shared';
import { apiRequest } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { CachedQueryStatus } from './CachedQueryStatus';
import {
  ConversationComposer,
  ConversationImage,
  MessageText,
} from './ConversationContent';
import { ConversationPostActions } from './ConversationPostActions';
import { ConversationThread } from './ConversationThread';

export function ConversationPage() {
  const { id } = useParams();
  const client = useQueryClient();
  const detail = useInfiniteQuery({
    queryKey: ['conversations', 'detail', id],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiRequest<ConversationDetailView>(`/conversations/${id}`, {
        query: { page: pageParam, order: 'desc' },
      }),
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length : undefined,
    enabled: !!id,
  });
  const topic = detail.data?.pages[0]?.topic;
  const comments = [
    ...new Map(
      detail.data?.pages
        .flatMap((page) => page.items)
        .map((item) => [item.id, item]),
    ).values(),
  ];
  function refresh() {
    void client.invalidateQueries({ queryKey: ['conversations'] });
  }
  return (
    <Stack
      spacing={2}
      sx={{ maxWidth: 780, mx: 'auto', width: '100%', minWidth: 0 }}
    >
      <Button
        component={Link}
        to="/conversations"
        sx={{ alignSelf: 'flex-start' }}
      >
        Voltar para as conversas
      </Button>
      <CachedQueryStatus
        updatedAt={detail.dataUpdatedAt}
        refreshing={detail.isFetching}
        onRefresh={refresh}
        label="conversa"
      />
      {detail.isPending && (
        <CircularProgress aria-label="Carregando conversa" />
      )}
      {detail.isError && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void detail.refetch()}>
              Tentar novamente
            </Button>
          }
        >
          {errorMessage(detail.error)}
        </Alert>
      )}
      {topic && (
        <Card
          component="article"
          variant="outlined"
          sx={{
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
          }}
        >
          <Stack spacing={2} sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar
                src={topic.author.avatar ?? undefined}
                alt={topic.author.name}
                sx={{ width: 44, height: 44, bgcolor: 'primary.main' }}
              >
                {personInitials(topic.author.name)}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontWeight={700}>{topic.author.name}</Typography>
                <Typography
                  component="time"
                  dateTime={topic.createdAt}
                  variant="caption"
                  color="text.secondary"
                >
                  {formatDateTime(topic.createdAt)}
                </Typography>
              </Box>
              <ConversationPostActions post={topic} topic onDeleted={refresh} />
            </Stack>
            <Typography
              variant="h5"
              component="h1"
              fontWeight={700}
              sx={{ overflowWrap: 'anywhere' }}
            >
              {topic.deletedAt ? 'conversa excluída' : topic.title}
            </Typography>
            {!topic.deletedAt && <MessageText post={topic} />}
          </Stack>
          {!topic.deletedAt && topic.hasImage && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                bgcolor: 'action.hover',
                '& img': { display: 'block', width: '100%', borderRadius: 0 },
              }}
            >
              <ConversationImage id={topic.id} />
            </Box>
          )}
          <Stack
            direction="row"
            justifyContent="space-between"
            sx={{ px: { xs: 2, sm: 3 }, py: 1.5 }}
          >
            <Typography variant="body2" color="text.secondary">
              {topic._count?.replies ?? comments.length} comentários
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Comunidade A Ponte
            </Typography>
          </Stack>
          <Divider />
          <Stack spacing={2.5} sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography component="h2" variant="subtitle1" fontWeight={700}>
                Comentários
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Mais recentes primeiro
              </Typography>
            </Stack>
            {!topic.deletedAt && (
              <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 3 }}>
                <ConversationComposer topicId={topic.id} onSaved={refresh} />
              </Box>
            )}
            {comments.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Ainda não há comentários. Comece a conversa!
              </Typography>
            )}
            {comments.map((post) => (
              <ConversationThread
                key={post.id}
                post={post}
                topicId={topic.id}
                closed={!!topic.deletedAt}
                onChanged={refresh}
              />
            ))}
            {detail.hasNextPage && (
              <Button
                variant="text"
                disabled={detail.isFetchingNextPage}
                onClick={() => void detail.fetchNextPage()}
              >
                {detail.isFetchingNextPage
                  ? 'Carregando comentários…'
                  : 'Mostrar mais comentários'}
              </Button>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
