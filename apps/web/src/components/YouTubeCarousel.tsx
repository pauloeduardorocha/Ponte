import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
  PlayCircleOutline,
  YouTube,
} from '@mui/icons-material';
import { apiRequest } from '../lib/api';

type Video = {
  id: string;
  title: string;
  publishedAt: string;
  url: string;
  thumbnailUrl: string;
};
const channelUrl = 'https://www.youtube.com/@IGREJAPONTE';

export function YouTubeCarousel() {
  const track = useRef<HTMLDivElement>(null);
  const query = useQuery({
    queryKey: ['church-videos'],
    queryFn: () => apiRequest<{ items: Video[]; stale: boolean }>('/videos'),
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });
  const scroll = (direction: number) => {
    const element = track.current;
    if (element)
      element.scrollBy({
        left: direction * element.clientWidth,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
  };
  return (
    <Box
      component="section"
      aria-labelledby="church-videos-title"
      sx={{ minWidth: 0 }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap={1}
        flexWrap="wrap"
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography id="church-videos-title" component="h2" variant="h6">
            Últimos vídeos da igreja
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Continue a acompanhar as mensagens de A Ponte.
          </Typography>
        </Box>
        <Button
          href={channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<YouTube />}
        >
          Ver canal
        </Button>
      </Stack>
      {query.isPending && (
        <Skeleton
          variant="rounded"
          height={230}
          aria-label="Carregando vídeos da igreja"
        />
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
          Não foi possível carregar os vídeos. Pode acompanhar as mensagens no
          canal da igreja.
        </Alert>
      )}
      {query.data?.stale && (
        <Alert severity="info" sx={{ mb: 2 }}>
          A atualização está temporariamente indisponível. A mostrar os últimos
          vídeos carregados.
        </Alert>
      )}
      {query.data && !query.data.items.length && (
        <Typography color="text.secondary">
          Ainda não há vídeos disponíveis no canal.
        </Typography>
      )}
      {!!query.data?.items.length && (
        <>
          <Box
            ref={track}
            role="region"
            aria-label="Vídeos recentes — deslize para ver mais"
            tabIndex={0}
            sx={{
              display: 'flex',
              gap: 2,
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              pb: 1,
            }}
          >
            {query.data.items.map((video) => (
              <Card
                key={video.id}
                variant="outlined"
                sx={{
                  flex: { xs: '0 0 85%', sm: '0 0 46%', lg: '0 0 31%' },
                  scrollSnapAlign: 'start',
                }}
              >
                <CardActionArea
                  component="a"
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Assistir: ${video.title} (abre no YouTube)`}
                  sx={{ height: '100%', display: 'block' }}
                >
                  <Box
                    sx={{
                      position: 'relative',
                      aspectRatio: '16 / 9',
                      bgcolor: 'grey.900',
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      component="img"
                      src={video.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <PlayCircleOutline
                      sx={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: 48,
                        color: 'white',
                        filter: 'drop-shadow(0 2px 4px #000)',
                      }}
                    />
                  </Box>
                  <CardContent>
                    <Typography
                      component="h3"
                      variant="subtitle1"
                      fontWeight={600}
                    >
                      {video.title}
                    </Typography>
                    <Typography
                      component="time"
                      dateTime={video.publishedAt}
                      variant="body2"
                      color="text.secondary"
                    >
                      {new Date(video.publishedAt).toLocaleDateString('pt-PT')}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Box>
          <Stack direction="row" justifyContent="flex-end">
            <IconButton
              aria-label="Vídeos anteriores"
              onClick={() => scroll(-1)}
            >
              <ChevronLeft />
            </IconButton>
            <IconButton aria-label="Próximos vídeos" onClick={() => scroll(1)}>
              <ChevronRight />
            </IconButton>
          </Stack>
        </>
      )}
    </Box>
  );
}
