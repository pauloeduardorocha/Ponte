import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import TranslateRounded from '@mui/icons-material/TranslateRounded';
import { useEffect, useRef } from 'react';
import { PageHeader } from '../components/PageParts';
import { useLiveTranslation } from '../lib/live-translation';
import { useLocalTranslation } from '../lib/use-local-translation';

export function LiveTranslationPage() {
  const session = useLiveTranslation();
  const url = session.active ? (session.data?.audienceUrl ?? null) : null;
  const player = useLocalTranslation(url);
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [player.text]);
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Tradução ao vivo"
        subtitle="Acompanhe a mensagem em inglês, com áudio e texto."
      />
      {!session.active ? (
        <Alert severity="info">
          Não há tradução publicada neste momento. O menu aparece quando o
          computador da igreja publica uma transmissão.
        </Alert>
      ) : (
        <>
          <Alert severity="info">
            Conecte-se ao Wi-Fi da igreja. Se solicitado, permita que o Ponte
            acesse a rede local. Use fones de ouvido.
          </Alert>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TranslateRounded color="primary" />
                  <Typography variant="h6">Português → English</Typography>
                  <Chip label={player.status} size="small" />
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button
                    variant="contained"
                    onClick={() => void player.connect()}
                    disabled={player.connected}
                  >
                    {player.connected ? 'Conectado' : 'Conectar à tradução'}
                  </Button>
                  {player.connected && (
                    <Button onClick={player.toggleMute}>
                      {player.muted ? 'Ativar áudio' : 'Silenciar áudio'}
                    </Button>
                  )}
                  <Button href={url!} target="_blank" rel="noopener noreferrer">
                    Abrir página local
                  </Button>
                </Stack>
                {player.error && (
                  <Alert severity="warning">{player.error}</Alert>
                )}
                <Box
                  ref={transcript}
                  role="log"
                  aria-live="polite"
                  aria-label="Texto da tradução"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    fontSize: { xs: '1.2rem', md: '1.5rem' },
                    lineHeight: 1.8,
                    minHeight: 200,
                    maxHeight: '55vh',
                    overflow: 'auto',
                    p: 2,
                    bgcolor: 'background.default',
                    borderRadius: 2,
                  }}
                >
                  {player.text || 'A tradução aparecerá aqui após a conexão.'}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}
