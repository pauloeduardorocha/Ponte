import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  Stack,
  Typography,
} from '@mui/material';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import type { PlaylistVideo, PlaylistVideoFeed } from '@church/shared';
import { apiRequest } from '../lib/api';

export function PlaylistPlayer({
  playlist,
}: {
  playlist: { id: string; title: string };
}) {
  const [selected, setSelected] = useState<PlaylistVideo>();
  const query = useInfiniteQuery({
    queryKey: ['playlist-videos', playlist.id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiRequest<PlaylistVideoFeed>(
        `/videos/playlists/${playlist.id}${pageParam ? `?pageToken=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (page) => page.nextPageToken,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const videos = query.data?.pages.flatMap((page) => page.items) ?? [];
  const selectedPosition = selected?.position ?? videos[0]?.position;
  const src = selected
    ? `https://www.youtube-nocookie.com/embed/${selected.id}?list=${playlist.id}&index=${selected.position}&autoplay=1&hl=pt`
    : `https://www.youtube-nocookie.com/embed?listType=playlist&list=${playlist.id}&autoplay=0&hl=pt`;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          md: 'minmax(0, 2fr) minmax(280px, 1fr)',
        },
        gap: 2,
        alignItems: 'start',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Box
          component="iframe"
          title={`Vídeos da playlist: ${playlist.title}`}
          src={src}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sx={{
            display: 'block',
            width: '100%',
            aspectRatio: '16 / 9',
            border: 0,
            borderRadius: 2,
            bgcolor: 'grey.900',
          }}
        />
        {selected && (
          <Typography component="h2" variant="h6" sx={{ mt: 2 }}>
            {selected.title}
          </Typography>
        )}
      </Box>
      <Stack
        component="section"
        aria-label="Vídeos desta playlist"
        spacing={1}
        sx={{
          minWidth: 0,
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <Typography
          component="h2"
          variant="subtitle1"
          fontWeight={600}
          sx={{ px: 2, pt: 2 }}
        >
          Vídeos da playlist
        </Typography>
        {query.isPending && (
          <Box role="status" sx={{ p: 2 }}>
            <CircularProgress size={24} aria-label="A carregar vídeos" />
          </Box>
        )}
        {query.isError && (
          <Alert
            severity="warning"
            action={
              <Button onClick={() => void query.refetch()}>
                Tentar novamente
              </Button>
            }
          >
            Não foi possível carregar a lista. Pode usar o menu do reprodutor ou
            abrir no YouTube.
          </Alert>
        )}
        {query.data?.pages.some((page) => page.stale) && (
          <Alert severity="info">A mostrar a última lista carregada.</Alert>
        )}
        {query.data && !videos.length && (
          <Typography sx={{ p: 2 }}>
            Não há vídeos públicos disponíveis nesta playlist.
          </Typography>
        )}
        <List
          aria-label="Selecionar vídeo"
          sx={{ maxHeight: { xs: 360, md: 520 }, overflowY: 'auto', p: 0 }}
        >
          {videos.map((video) => (
            <ListItem key={`${video.position}-${video.id}`} disablePadding>
              <ListItemButton
                selected={selectedPosition === video.position}
                aria-pressed={selectedPosition === video.position}
                onClick={() => setSelected(video)}
                sx={{ gap: 1.5, alignItems: 'center' }}
              >
                <Box sx={{ width: 20, flexShrink: 0, color: 'text.secondary' }}>
                  {selectedPosition === video.position ? (
                    <PlayArrowRounded fontSize="small" aria-hidden="true" />
                  ) : (
                    video.position + 1
                  )}
                </Box>
                <Box
                  component="img"
                  src={video.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  sx={{
                    width: 96,
                    aspectRatio: '16 / 9',
                    objectFit: 'cover',
                    borderRadius: 1,
                    flexShrink: 0,
                  }}
                />
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {video.title}
                </Typography>
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        {query.hasNextPage && (
          <Button
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? 'A carregar…' : 'Carregar mais vídeos'}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
