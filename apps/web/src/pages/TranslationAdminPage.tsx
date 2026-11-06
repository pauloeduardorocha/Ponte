import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { PageHeader } from '../components/PageParts';
import { apiRequest, apiResponse } from '../lib/api';
import { translationApiUrl, useLiveTranslation } from '../lib/live-translation';
import { errorMessage } from '../lib/errors';

export function TranslationAdminPage() {
  const [configuration, setConfiguration] = useState(''),
    [notice, setNotice] = useState('');
  const client = useQueryClient(),
    live = useLiveTranslation();
  const download = useQuery({
    queryKey: ['live-translation', 'download'],
    queryFn: () =>
      apiRequest<{ url: string | null; localAvailable: boolean }>(
        '/live-translation/download',
      ),
    staleTime: 0,
  });
  const credential = useMutation({
    mutationFn: () =>
      apiRequest<{ token: string }>('/live-translation/credential', {
        method: 'POST',
      }),
    onSuccess: (result) => {
      setConfiguration(
        JSON.stringify({
          apiUrl: translationApiUrl(),
          appOrigin: window.location.origin,
          token: result.token,
        }),
      );
      void client.invalidateQueries({
        queryKey: ['live-translation', 'status'],
      });
    },
  });
  async function downloadLocal() {
    try {
      setNotice('Preparando download…');
      const response = await apiResponse('/live-translation/download/archive'),
        blob = await response.blob();
      const url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'Ponte-Traducao-Windows.zip';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice(
        'Download iniciado. Extraia o ZIP antes de abrir o aplicativo.',
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Aplicativo de tradução"
        subtitle="Prepare o computador da igreja para traduzir o culto e publicar na PWA."
      />
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h6">
              1. Baixe e abra no Windows
            </Typography>
            <Typography>
              Extraia a pasta do ZIP e abra Ponte-Traducao.exe. O pacote inclui
              tudo para executar, sem instalar Node.js. Mantenha o computador
              ligado e conectado ao Wi-Fi da igreja.
            </Typography>
            {download.data?.url ? (
              <Button
                variant="contained"
                href={download.data.url}
                startIcon={<DownloadRounded />}
                sx={{ alignSelf: 'flex-start' }}
              >
                Baixar aplicativo para Windows
              </Button>
            ) : download.data?.localAvailable ? (
              <Button
                variant="contained"
                onClick={() => void downloadLocal()}
                startIcon={<DownloadRounded />}
                sx={{ alignSelf: 'flex-start' }}
              >
                Baixar aplicativo para Windows
              </Button>
            ) : (
              <Alert severity="info">
                O download ainda não está disponível neste ambiente. Configure
                TRANSLATION_APP_DOWNLOAD_URL com o endereço HTTPS do pacote
                Windows para disponibilizar a versão publicada.
              </Alert>
            )}
            {download.error && (
              <Alert severity="error">{errorMessage(download.error)}</Alert>
            )}
            {notice && <Alert severity="info">{notice}</Alert>}
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h6">
              2. Conecte o aplicativo ao Ponte
            </Typography>
            <Alert severity="warning">
              Gerar uma nova ligação revoga a anterior e retira a transmissão
              atual do menu. Guarde a ligação com segurança; ela autoriza
              publicar no Ponte.
            </Alert>
            <Button
              variant="outlined"
              onClick={() => credential.mutate()}
              disabled={credential.isPending}
              sx={{ alignSelf: 'flex-start' }}
            >
              Gerar ligação para o computador
            </Button>
            {credential.error && (
              <Alert severity="error">{errorMessage(credential.error)}</Alert>
            )}
            {configuration && (
              <>
                <TextField
                  label="Ligação do aplicativo"
                  value={configuration}
                  type="password"
                  InputProps={{ readOnly: true }}
                  fullWidth
                />
                <Button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(configuration)
                      .then(() =>
                        setNotice(
                          'Ligação copiada. Cole no aplicativo do computador.',
                        ),
                      )
                      .catch(() =>
                        setNotice(
                          'Não foi possível copiar. Selecione o campo da ligação e copie manualmente.',
                        ),
                      )
                  }
                >
                  Copiar ligação
                </Button>
                <Typography variant="body2" color="text.secondary">
                  Exibida somente nesta sessão. Cole em “Ligação gerada pelo
                  administrador” no aplicativo.
                </Typography>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h6">
              3. Inicie e publique a tradução
            </Typography>
            <Typography>
              No aplicativo: informe a chave Gemini, selecione o microfone e
              inicie a tradução. Escolha o endereço da rede Wi-Fi da igreja e
              clique em Publicar tradução. O menu aparece em até 1 minuto. Ao
              parar, ele é retirado; se o computador desconectar, a publicação
              expira em até 2 minutos.
            </Typography>
            <Alert severity={live.active ? 'success' : 'info'}>
              {live.active
                ? 'Há uma tradução publicada no Ponte.'
                : 'Nenhuma tradução publicada.'}
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Áudio e texto circulam somente na rede local. O Ponte consulta
              apenas a disponibilidade. Alguns navegadores exigem permissão de
              rede local; a página oferece um link direto como alternativa.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
