import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import YouTube from '@mui/icons-material/YouTube';
import { Link, useParams } from 'react-router-dom';
import { videoPlaylists } from '../lib/video-playlists';

export function VideosPage() {
  const { playlistId } = useParams();
  const playlist = videoPlaylists.find((item) => item.id === playlistId);

  if (playlistId && !playlist) {
    return (
      <Stack spacing={2}>
        <Typography component="h1" variant="h4">
          Playlist não encontrada
        </Typography>
        <Alert severity="info">Escolha uma das playlists disponíveis.</Alert>
        <Button component={Link} to="/videos">
          Ver playlists
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap={2}
        flexWrap="wrap"
      >
        <Box>
          <Typography component="h1" variant="h4">
            {playlist?.title ?? 'Vídeos'}
          </Typography>
          <Typography color="text.secondary">
            {playlist
              ? 'Assista aos vídeos e escolha outras mensagens no menu do reprodutor.'
              : 'Mensagens, louvores e séries da Igreja Ponte. Escolha uma playlist para assistir.'}
          </Typography>
        </Box>
        <Button
          href={
            playlist
              ? `https://www.youtube.com/playlist?list=${playlist.id}`
              : 'https://www.youtube.com/@IGREJAPONTE/playlists'
          }
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<YouTube />}
        >
          {playlist ? 'Abrir no YouTube' : 'Ver canal'}
        </Button>
      </Stack>
      {playlist ? (
        <>
          <Button
            component={Link}
            to="/videos"
            startIcon={<ArrowBackRounded />}
            sx={{ alignSelf: 'flex-start' }}
          >
            Todas as playlists
          </Button>
          <Box
            key={playlist.id}
            component="iframe"
            title={`Vídeos da playlist: ${playlist.title}`}
            src={`https://www.youtube-nocookie.com/embed?listType=playlist&list=${playlist.id}&autoplay=0&hl=pt`}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sx={{
              width: '100%',
              aspectRatio: '16 / 9',
              minHeight: 240,
              border: 0,
              borderRadius: 2,
              bgcolor: 'grey.900',
            }}
          />
          <Typography variant="body2" color="text.secondary">
            Use o ícone de lista no reprodutor para escolher os vídeos desta
            playlist. Se um vídeo não estiver disponível aqui, use “Abrir no
            YouTube”.
          </Typography>
        </>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(3, 1fr)',
            },
            gap: 2,
          }}
        >
          {videoPlaylists.map((item) => (
            <Card key={item.id} variant="outlined">
              <CardActionArea
                component={Link}
                to={`/videos/${item.id}`}
                sx={{ height: '100%', display: 'block' }}
              >
                <Box
                  component="img"
                  src={item.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  sx={{
                    width: '100%',
                    aspectRatio: '16 / 9',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
                <CardContent>
                  <Typography component="h2" variant="h6">
                    {item.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Ver vídeos da playlist
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}
    </Stack>
  );
}
