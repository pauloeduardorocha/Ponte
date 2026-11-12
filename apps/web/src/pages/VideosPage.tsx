import { t as translate, useLocale } from '../i18n';
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
import { PlaylistPlayer } from '../components/PlaylistPlayer';

export function VideosPage() {
  useLocale();
  const { playlistId } = useParams();
  const playlist = videoPlaylists.find((item) => item.id === playlistId);

  if (playlistId && !playlist) {
    return (
      <Stack spacing={2}>
        <Typography component="h1" variant="h4">
          {translate('Playlist não encontrada')}
        </Typography>
        <Alert severity="info">
          {translate('Escolha uma das playlists disponíveis.')}
        </Alert>
        <Button component={Link} to="/videos">
          {translate('Ver playlists')}
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
            {playlist?.title ?? translate('Vídeos')}
          </Typography>
          <Typography color="text.secondary">
            {playlist
              ? translate(
                  'Escolha um vídeo na lista para assistir às mensagens desta playlist.',
                )
              : translate(
                  'Mensagens, louvores e séries da Igreja Ponte. Escolha uma playlist para assistir.',
                )}
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
          {playlist ? translate('Abrir no YouTube') : translate('Ver canal')}
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
            {translate('Todas as playlists')}
          </Button>
          <PlaylistPlayer key={playlist.id} playlist={playlist} />
          <Typography variant="body2" color="text.secondary">
            {translate(
              'Se um vídeo não estiver disponível aqui, use “Abrir no YouTube”.',
            )}
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
                    {translate('Ver vídeos da playlist')}
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
