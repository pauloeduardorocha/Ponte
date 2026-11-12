import { t as translate, useLocale } from '../i18n';
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
  useLocale();
  const session = useLiveTranslation({ publicAccess });
  const url = session.active ? (session.data?.audienceUrl ?? null) : null;
  return (
    <Stack spacing={3}>
      <PageHeader
        title={translate('Tradução ao vivo')}
        subtitle={translate(
          'Escolha um canal e acompanhe a mensagem no seu idioma, com áudio e texto.',
        )}
      />
      {session.isPending ? (
        <Alert severity="info">
          {translate('Procurando a tradução ao vivo…')}
        </Alert>
      ) : session.isError ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={() => void session.refetch()}>
              {translate('Tentar novamente')}
            </Button>
          }
        >
          {translate(
            'Não foi possível verificar a transmissão. Confira sua conexão.',
          )}
        </Alert>
      ) : !session.active ? (
        <Box
          role="status"
          sx={{ py: 6, px: 2, textAlign: 'center', color: 'text.secondary' }}
        >
          <TranslateRounded
            aria-hidden="true"
            sx={{ fontSize: 40, mb: 2, opacity: 0.6 }}
          />
          <Typography variant="h6" color="text.primary">
            {translate('Aguardando a transmissão')}
          </Typography>
          <Typography sx={{ mt: 1, maxWidth: 440, mx: 'auto' }}>
            {translate(
              'Assim que começar, a tradução aparecerá aqui. Pode manter esta página aberta.',
            )}
          </Typography>
        </Box>
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
                <Typography variant="h6">
                  {translate('Canais de tradução')}
                </Typography>
                <Chip
                  label={translate('Disponível ao vivo')}
                  size="small"
                  color="success"
                />
              </Stack>
              <Alert severity="info">
                {translate(
                  'Conecte-se ao Wi-Fi da igreja e use fones de ouvido.',
                )}
              </Alert>
              <Typography>
                {translate(
                  'Ouça e acompanhe o texto na mesma tela. Use o mesmo leitor com a tela aberta, minimizada ou bloqueada, quando o aparelho permitir.',
                )}
              </Typography>
              <Button variant="contained" href={url!}>
                {translate('Abrir tradução ao vivo')}
              </Button>
              <Typography variant="body2" color="text.secondary">
                {translate(
                  'A tradução abre nesta aba, diretamente no computador da igreja. Na próxima tela, escolha um canal e toque em Ouvir ao vivo. Use o botão Voltar do navegador para retornar ao Ponte.',
                )}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {translate(
                  'Mantenha o Wi-Fi conectado e esta aba aberta. Ao pausar e retomar, ouvirá a transmissão atual.',
                )}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

export function PublicTranslationPage() {
  useLocale();
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
            {translate('Voltar ao login')}
          </Button>
        </Stack>
        <LiveTranslationPage publicAccess />
      </Container>
    </Box>
  );
}
