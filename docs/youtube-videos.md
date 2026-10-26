# Vídeos da igreja

## Menu de playlists

O menu **Vídeos** está disponível a todas as contas autenticadas, mesmo sem permissões. Inclui **Todas as playlists** (`/videos`) e um submenu por playlist (`/videos/:playlistId`). O catálogo em `apps/web/src/lib/video-playlists.ts` contém as 27 playlists públicas verificadas no canal @IGREJAPONTE em 22/10/2026, incluindo a consulta da continuação da listagem do canal.

Cada página incorpora o reprodutor oficial da playlist, sem reprodução automática, com seleção de vídeos no menu do próprio reprodutor e link alternativo para abrir no YouTube. O reprodutor é recriado ao mudar de playlist para interromper o vídeo anterior. IDs fora do catálogo mostram uma mensagem de playlist não encontrada.

Os vídeos de cada playlist são carregados diretamente pelo YouTube e acompanham as alterações da playlist. Novas playlists e alterações de nome devem ser atualizadas no catálogo local; não há sincronização automática do catálogo. Esta funcionalidade não requer chave de API nem novos endpoints. Vídeos privados, removidos ou com incorporação desativada dependem das regras do YouTube.

Referência do reprodutor: https://developers.google.com/youtube/player_parameters#Selecting_Content_to_Play

O painel inicial apresenta um carrossel para todas as contas autenticadas, sem permissões administrativas. Os cartões abrem o vídeo no YouTube numa nova aba. A faixa suporta deslizar no telemóvel, navegação por teclado e botões anterior/próximo, sem reprodução automática.

## Contrato

`GET /api/v1/videos` exige a autenticação padrão da aplicação. Resposta 200:

```json
{
  "channelUrl": "https://www.youtube.com/@IGREJAPONTE",
  "items": [
    {
      "id": "_Gb6VuoU3GU",
      "title": "Reunião Família 11/10/2026",
      "publishedAt": "2026-10-11T23:05:07.000Z",
      "url": "https://www.youtube.com/watch?v=_Gb6VuoU3GU",
      "thumbnailUrl": "https://i.ytimg.com/vi/_Gb6VuoU3GU/hqdefault.jpg"
    }
  ],
  "updatedAt": "2026-10-16T12:00:00.000Z",
  "stale": false
}
```

Até 12 vídeos ordenados por publicação decrescente. Lista vazia é válida. `updatedAt` indica a última consulta bem-sucedida; `stale` indica dados anteriores após falha do YouTube. Sem cache, a indisponibilidade retorna 503; sem autenticação, 401.

## Integração

Para produção, configurar `YOUTUBE_API_KEY` exclusivamente no servidor (Vercel → Environment Variables → Production) e fazer novo deploy. Ativar **YouTube Data API v3** no projeto Google Cloud da chave e restringir a chave a essa API. Nunca usar prefixo `VITE_` nem incluir a chave em commits ou mensagens.

Com a chave configurada, a API consulta `channels.list(part=contentDetails)` para descobrir a playlist de uploads e `playlistItems.list(part=snippet,contentDetails,maxResults=12)` para carregar os vídeos. Usa `contentDetails.videoPublishedAt`, a data de publicação do vídeo, em vez da data de inclusão na playlist. São duas chamadas por atualização bem-sucedida por instância, mantendo o cache e o contrato existentes. Falhas de credenciais, quota ou rede preservam cache anterior/503 e o intervalo de repetição; não desencadeiam scraping de páginas.

Sem a chave, mantém-se a integração pública abaixo, sujeita a indisponibilidade. Em 26/10/2026 o feed devolveu 404 e as páginas de vídeos individuais devolveram intermitentemente HTML de CAPTCHA com HTTP 200. Portanto, a alternativa HTML não garante recuperação e a correção para produção depende da configuração da chave.

Referências oficiais: [playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list) e [campos de playlistItem](https://developers.google.com/youtube/v3/docs/playlistItems).

Diagnóstico: erros da API oficial registam nos logs do servidor o recurso, o status HTTP e motivos reconhecidos do Google, sem a chave, URL do pedido ou mensagem/corpo completo. `SERVICE_DISABLED`/`accessNotConfigured` indica ativação pendente da YouTube Data API v3 no projeto da chave; `API_KEY_HTTP_REFERRER_BLOCKED`/`API_KEY_IP_ADDRESS_BLOCKED` indica restrição incompatível com o servidor; `API_KEY_SERVICE_BLOCKED` indica restrição à API errada; `quotaExceeded` indica quota esgotada. O cliente continua a receber a mensagem genérica de indisponibilidade.

Feed Atom público: `https://www.youtube.com/feeds/videos.xml?channel_id=UCJjDDzfbKwIZoiyIXVhsh0Q`. O ID foi confirmado nos metadados do canal @IGREJAPONTE. Não requer chave de API. O feed contém uma janela limitada de publicações, podendo incluir transmissões e Shorts.

Cache em memória por instância durante 10 minutos, pedidos simultâneos agrupados, timeout de 8 segundos e intervalo de 1 minuto após falhas. A interface consulta novamente a cada 10 minutos enquanto aberta. Uma reinicialização elimina o cache. O link para o canal permanece disponível durante falhas.

Referência oficial do formato: https://developers.google.com/youtube/v3/guides/push_notifications

Se o feed falhar (incluindo resposta 404), a API consulta a página pública de vídeos do canal e os metadados estruturados dos vídeos. Essa alternativa mantém o contrato e as datas reais de publicação, consulta até 12 vídeos com concorrência máxima de quatro e prazo total de oito segundos. Como depende do HTML do YouTube, mudanças no formato podem exigir manutenção. Se ambas as fontes falharem, mantém o comportamento de cache anterior/503.
