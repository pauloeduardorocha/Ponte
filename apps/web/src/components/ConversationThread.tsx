import { t as translate, useLocale } from '../i18n';
import { errorMessage, personInitials } from './conversation-utils';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Alert, Avatar, Box, Button, Stack, Typography } from '@mui/material';
import type {
  ConversationPageView,
  ConversationPostView,
} from '@church/shared';
import { apiRequest } from '../lib/api';
import { formatDateTime } from '../lib/format';
import {
  ConversationComposer,
  ConversationImage,
  MessageText,
} from './ConversationContent';
import { ConversationPostActions } from './ConversationPostActions';

export function ConversationThread({
  post,
  topicId,
  closed,
  onChanged,
  depth = 0,
}: {
  post: ConversationPostView;
  topicId: string;
  closed: boolean;
  onChanged: () => void;
  depth?: number;
}) {
  useLocale();
  const [replying, setReplying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const replies = useInfiniteQuery({
    queryKey: ['conversations', 'thread', topicId, post.id],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiRequest<ConversationPageView>(`/conversations/${topicId}/replies`, {
        query: { parentId: post.id, page: pageParam, order: 'desc' },
      }),
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length : undefined,
    enabled: expanded,
  });
  const children = [
    ...new Map(
      replies.data?.pages
        .flatMap((page) => page.items)
        .map((item) => [item.id, item]),
    ).values(),
  ];
  return (
    <Stack
      component="article"
      aria-label={translate('Comentário de {0}', [post.author.name])}
      spacing={1}
      sx={{ minWidth: 0 }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Avatar
          src={post.author.avatar ?? undefined}
          alt={post.author.name}
          sx={{ width: 32, height: 32, fontSize: 12, bgcolor: 'primary.main' }}
        >
          {personInitials(post.author.name)}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              bgcolor: 'action.hover',
              borderRadius: 3,
              px: 1.75,
              py: 1.25,
              width: 'fit-content',
              maxWidth: '100%',
              overflowWrap: 'anywhere',
            }}
          >
            <Typography variant="body2" fontWeight={700}>
              {post.author.name}
            </Typography>
            {post.deletedAt ? (
              <Typography
                variant="body2"
                color="text.secondary"
                fontStyle="italic"
              >
                {translate('mensagem excluída')}
              </Typography>
            ) : (
              <MessageText post={post} />
            )}
          </Box>
          {!post.deletedAt && post.hasImage && (
            <Box sx={{ mt: 1 }}>
              <ConversationImage id={post.id} />
            </Box>
          )}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            sx={{ mt: 0.25 }}
          >
            <Typography
              component="time"
              dateTime={post.createdAt}
              variant="caption"
              color="text.secondary"
            >
              {formatDateTime(post.createdAt)}
            </Typography>
            {!closed && !post.deletedAt && (
              <Button
                size="small"
                color="inherit"
                aria-label={translate('Responder a {0}', [post.author.name])}
                onClick={() => setReplying((value) => !value)}
              >
                {translate('Responder')}
              </Button>
            )}
            <ConversationPostActions post={post} onDeleted={onChanged} />
          </Stack>
          {replying && !closed && !post.deletedAt && (
            <Box
              sx={{
                p: 1.5,
                mt: 1,
                border: 1,
                borderColor: 'divider',
                borderRadius: 3,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {translate('Respondendo a ')}
                {post.author.name}
              </Typography>
              <ConversationComposer
                topicId={topicId}
                parentId={post.id}
                onSaved={() => {
                  setReplying(false);
                  setExpanded(true);
                  onChanged();
                }}
              />
              <Button size="small" onClick={() => setReplying(false)}>
                {translate('Cancelar resposta')}
              </Button>
            </Box>
          )}
          {!expanded && !!post._count?.children && (
            <Button size="small" onClick={() => setExpanded(true)}>
              {translate('Ver ')}
              {post._count.children}{' '}
              {post._count.children === 1
                ? translate('resposta')
                : translate('respostas')}
            </Button>
          )}
        </Box>
      </Stack>
      {expanded && (
        <Stack
          spacing={2}
          sx={{
            ml: depth < 3 ? { xs: 2, sm: 4 } : 0,
            borderLeft: depth < 3 ? 2 : 0,
            borderColor: 'divider',
            pl: depth < 3 ? { xs: 1, sm: 2 } : 0,
          }}
        >
          {replies.isPending && (
            <Typography role="status" variant="caption">
              {translate('Carregando respostas…')}
            </Typography>
          )}
          {replies.isError && (
            <Alert
              severity="error"
              action={
                <Button onClick={() => void replies.refetch()}>
                  {translate('Tentar novamente')}
                </Button>
              }
            >
              {errorMessage(replies.error)}
            </Alert>
          )}
          {children.map((child) => (
            <ConversationThread
              key={child.id}
              post={child}
              topicId={topicId}
              closed={closed}
              onChanged={onChanged}
              depth={depth + 1}
            />
          ))}
          {replies.hasNextPage && (
            <Button
              disabled={replies.isFetchingNextPage}
              onClick={() => void replies.fetchNextPage()}
            >
              {translate('Mostrar mais respostas')}
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}
