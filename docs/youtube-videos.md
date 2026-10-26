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

Feed Atom público: `https://www.youtube.com/feeds/videos.xml?channel_id=UCJjDDzfbKwIZoiyIXVhsh0Q`. O ID foi confirmado nos metadados do canal @IGREJAPONTE. Não requer chave de API. O feed contém uma janela limitada de publicações, podendo incluir transmissões e Shorts.

Cache em memória por instância durante 10 minutos, pedidos simultâneos agrupados, timeout de 8 segundos e intervalo de 1 minuto após falhas. A interface consulta novamente a cada 10 minutos enquanto aberta. Uma reinicialização elimina o cache. O link para o canal permanece disponível durante falhas.

Referência oficial do formato: https://developers.google.com/youtube/v3/guides/push_notifications

Se o feed falhar (incluindo resposta 404), a API consulta a página pública de vídeos do canal e os metadados estruturados dos vídeos. Essa alternativa mantém o contrato e as datas reais de publicação, consulta até 12 vídeos com concorrência máxima de quatro e prazo total de oito segundos. Como depende do HTML do YouTube, mudanças no formato podem exigir manutenção. Se ambas as fontes falharem, mantém o comportamento de cache anterior/503.
