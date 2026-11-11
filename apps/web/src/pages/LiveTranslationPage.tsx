import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Stack,
  Typography,
} from '@mui/material';
import TranslateRounded from '@mui/icons-material/TranslateRounded';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader } from '../components/PageParts';
import { useLiveTranslation } from '../lib/live-translation';

export function LiveTranslationPage({
  publicAccess = false,
}: { publicAccess?: boolean } = {}) {
  const session = useLiveTranslation({ publicAccess });
  const url = session.active ? (session.data?.audienceUrl ?? null) : null;
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Tradução ao vivo"
        subtitle="Escolha um canal e acompanhe a mensagem no seu idioma, com áudio e texto."
      />
      {session.isPending ? (
        <Alert severity="info">Procurando a tradução ao vivo…</Alert>
      ) : session.isError ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={() => void session.refetch()}>
              Tentar novamente
            </Button>
          }
        >
          Não foi possível verificar a transmissão. Confira sua conexão.
        </Alert>
      ) : !session.active ? (
        <Alert severity="info">
          Não há nenhuma transmissão ativa no momento. Por favor, aguarde o
          início da transmissão.
        </Alert>
      ) : (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                flexWrap="wrap"
                useFlexGap
              >
                <TranslateRounded color="primary" />
                <Typography variant="h6">Canais de tradução</Typography>
                <Chip label="Disponível ao vivo" size="small" color="success" />
              </Stack>
              <Alert severity="info">
                Conecte-se ao Wi-Fi da igreja e use fones de ouvido.
              </Alert>
              <Typography>
                Ouça e acompanhe o texto na mesma tela. Use o mesmo leitor com a
                tela aberta, minimizada ou bloqueada, quando o aparelho
                permitir.
              </Typography>
              <Button variant="contained" href={url!}>
                Abrir tradução ao vivo
              </Button>
              <Typography variant="body2" color="text.secondary">
                A tradução abre nesta aba, diretamente no computador da igreja.
                Na próxima tela, escolha um canal e toque em Ouvir ao vivo. Use
                o botão Voltar do navegador para retornar ao Ponte.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Mantenha o Wi-Fi conectado e esta aba aberta. Ao pausar e
                retomar, ouvirá a transmissão atual.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

export function PublicTranslationPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        py: { xs: 3, md: 5 },
      }}
    >
      <Container maxWidth="md">
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 4 }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              component="img"
              src="/logo.png"
              alt="A Ponte"
              width={44}
              height={44}
            />
            <Typography fontWeight={700}>A Ponte</Typography>
          </Stack>
          <Button component={RouterLink} to="/login">
            Voltar ao login
          </Button>
        </Stack>
        <LiveTranslationPage publicAccess />
      </Container>
    </Box>
  );
}
