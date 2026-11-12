import { t as translate, useLocale } from '../i18n';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import windowsGuide from '../content/translation-windows-guide.json';
import { PageHeader } from '../components/PageParts';
import { apiRequest, apiResponse } from '../lib/api';
import { translationApiUrl, useLiveTranslation } from '../lib/live-translation';
import { errorMessage } from '../lib/errors';

export function TranslationAdminPage() {
  useLocale();
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
      setNotice(translate('Preparando download…'));
      const response = await apiResponse('/live-translation/download/archive'),
        blob = await response.blob();
      const url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'Ponte-Traducao-Windows.zip';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice(
        translate('Download iniciado. Extraia o ZIP e execute Instalar.cmd.'),
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  return (
    <Stack spacing={3}>
      <PageHeader
        title={translate('Aplicativo de tradução')}
        subtitle={translate(
          'Prepare o computador da igreja para traduzir o culto e publicar na PWA.',
        )}
      />
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h6">
              {translate('1. Baixe e instale no Windows')}
            </Typography>
            <Typography>
              {translate(
                'Extraia a pasta do ZIP e execute Instalar.cmd. Depois, use o atalho Ponte - Tradução. Para atualizar, feche o aplicativo e execute o instalador da nova versão: ele substitui a anterior no mesmo local, mantendo os atalhos.',
              )}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {translate(
                'O ZIP inclui GUIA-COMECE-AQUI.html e LEIA-ME-PRIMEIRO.txt ao lado do aplicativo. Abra o guia com dois cliques para consultar sem internet.',
              )}
            </Typography>
            <Button href="#guia-windows" sx={{ alignSelf: 'flex-start' }}>
              {translate('Ver guia passo a passo para Windows')}
            </Button>
            {download.data?.url ? (
              <Button
                variant="contained"
                href={download.data.url}
                startIcon={<DownloadRounded />}
                sx={{ alignSelf: 'flex-start' }}
              >
                {translate('Baixar aplicativo para Windows')}
              </Button>
            ) : download.data?.localAvailable ? (
              <Button
                variant="contained"
                onClick={() => void downloadLocal()}
                startIcon={<DownloadRounded />}
                sx={{ alignSelf: 'flex-start' }}
              >
                {translate('Baixar aplicativo para Windows')}
              </Button>
            ) : (
              <Alert severity="info">
                {translate(
                  'O pacote Windows ainda não foi disponibilizado neste ambiente. Peça ao responsável pelo Ponte para publicar a versão de download.',
                )}
              </Alert>
            )}
            {download.error && (
              <Alert severity="error">{errorMessage(download.error)}</Alert>
            )}
            {notice && <Alert severity="info">{translate(notice ?? '')}</Alert>}
          </Stack>
        </CardContent>
      </Card>
      <Card id="guia-windows" sx={{ scrollMarginTop: 90 }}>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h6">
              {translate(windowsGuide.title)}
            </Typography>
            <Typography color="text.secondary">
              {translate(windowsGuide.introduction)}
            </Typography>
            <Box>
              {windowsGuide.sections.map((section, index) => (
                <Accordion
                  key={translate(section.title)}
                  defaultExpanded={index === 0}
                  disableGutters
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreRounded />}
                    aria-controls={`windows-guide-${index}`}
                    id={`windows-guide-heading-${index}`}
                  >
                    <Typography component="h3" fontWeight={650}>
                      {translate(section.title)}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails id={`windows-guide-${index}`}>
                    <Box component="ol" sx={{ pl: 3, m: 0 }}>
                      {section.steps.map((step) => (
                        <Typography
                          component="li"
                          key={translate(step)}
                          sx={{ mb: 1.5, lineHeight: 1.7 }}
                        >
                          {translate(step)}
                        </Typography>
                      ))}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              ))}
              <Accordion disableGutters>
                <AccordionSummary
                  expandIcon={<ExpandMoreRounded />}
                  aria-controls="windows-troubleshooting"
                  id="windows-troubleshooting-heading"
                >
                  <Typography component="h3" fontWeight={650}>
                    {translate('Se algo não funcionar')}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails id="windows-troubleshooting">
                  <Stack spacing={2}>
                    {windowsGuide.troubleshooting.map((item) => (
                      <Box key={translate(item.problem)}>
                        <Typography component="h4" fontWeight={650}>
                          {translate(item.problem)}
                        </Typography>
                        <Typography color="text.secondary">
                          {translate(item.solution)}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </Box>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h6">
              {translate('2. Conecte o aplicativo ao Ponte')}
            </Typography>
            <Alert severity="warning">
              {translate(
                'Gerar uma nova ligação revoga a anterior e retira a transmissão atual do menu. Guarde a ligação com segurança; ela autoriza publicar no Ponte.',
              )}
            </Alert>
            <Button
              variant="outlined"
              onClick={() => credential.mutate()}
              disabled={credential.isPending}
              sx={{ alignSelf: 'flex-start' }}
            >
              {translate('Gerar ligação para o computador')}
            </Button>
            {credential.error && (
              <Alert severity="error">{errorMessage(credential.error)}</Alert>
            )}
            {configuration && (
              <>
                <TextField
                  label={translate('Ligação do aplicativo')}
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
                          translate(
                            'Ligação copiada. Cole no aplicativo do computador.',
                          ),
                        ),
                      )
                      .catch(() =>
                        setNotice(
                          translate(
                            'Não foi possível copiar. Selecione o campo da ligação e copie manualmente.',
                          ),
                        ),
                      )
                  }
                >
                  {translate('Copiar ligação')}
                </Button>
                <Typography variant="body2" color="text.secondary">
                  {translate(
                    'Exibida somente nesta sessão. Cole em “Ligação gerada pelo administrador” no aplicativo.',
                  )}
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
              {translate('3. Inicie e publique a tradução')}
            </Typography>
            <Typography>
              {translate(
                'No aplicativo: informe a chave Gemini, selecione o microfone e inicie a tradução. Escolha o endereço da rede Wi-Fi da igreja e clique em Publicar tradução. O menu aparece em até 1 minuto. Ao parar, ele é retirado; se o computador desconectar, a publicação expira em até 2 minutos.',
              )}
            </Typography>
            <Alert severity={live.active ? 'success' : 'info'}>
              {live.active
                ? translate('Há uma tradução publicada no Ponte.')
                : translate('Nenhuma tradução publicada.')}
            </Alert>
            <Typography variant="body2" color="text.secondary">
              {translate(
                'Áudio e texto circulam somente na rede local. O Ponte consulta apenas a disponibilidade. Alguns navegadores exigem permissão de rede local; a página oferece um link direto como alternativa.',
              )}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
