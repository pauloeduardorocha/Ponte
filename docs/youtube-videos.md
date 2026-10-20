# Vídeos da igreja

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
