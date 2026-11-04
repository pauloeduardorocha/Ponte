# Painéis de conversas

Contas com status `ACTIVE` podem consultar, criar e responder a conversas na página inicial, independentemente de permissões administrativas. Contas pendentes, desativadas e visitantes não têm acesso à API nem à página de detalhes.

O carrossel apresenta tópicos independentes com título, autor, data e quantidade de respostas, em páginas de 20 cards. A página `/conversations/:id` apresenta o tópico inicial e respostas em ordem cronológica, em páginas de 10. Listagem, detalhes e imagens usam cache privado no cliente com TTL de 6 horas, persistido entre recargas pelo mesmo CacheStorage dos demais endpoints. Não há polling. Criar, responder ou excluir invalida o cache; a atualização manual da aplicação também força nova leitura. Alterações de outras sessões aparecem após expirar o TTL ou atualizar manualmente.

Cada publicação aceita texto de até 10.000 caracteres e uma imagem PNG, JPEG ou WebP de até 1.048.576 bytes (1 MB). Títulos têm até 160 caracteres. Imagens são persistidas com a publicação e consultadas separadamente por endpoint autenticado; não existem URLs públicas de anexos. Links HTTP/HTTPS são clicáveis, com abertura em outra aba. HTML é exibido como texto.

Digite `@` e pelo menos duas letras para buscar membros ativos, inclusive membros sem conta. O editor exibe `@Nome` e converte a seleção em uma referência `@[Nome](UUID)` apenas ao enviar. Membros com nomes iguais recebem um sufixo numérico no editor para distinguir as seleções. A API valida até 20 referências distintas por publicação. Apenas ID e nome são expostos pela busca, sem informações de contato. Os nomes exibidos são resolvidos a partir do cadastro atual; membros inativos ou anonimizados aparecem como “membro indisponível”. As menções não enviam notificações nesta versão.

Somente o autor da publicação ou usuários com papel `ADMIN`/`SUPER_ADMIN` podem excluí-la. A exclusão é lógica: texto, imagem, autor, data e referências permanecem no banco, com `deletedAt` e `deletedBy`; as respostas continuam vinculadas. A API pública autenticada oculta título, texto, imagem e menções do registro excluído. A interface mostra “conversa excluída” ou “mensagem excluída”, preservando autor e data. Uma conversa excluída mantém as respostas existentes visíveis, mas não aceita novas respostas. A exclusão de uma conversa não autoriza seu autor a excluir respostas de outras pessoas.

## Contrato HTTP

Todos os endpoints usam o prefixo `/api/v1` e exigem sessão de conta aprovada. GETs da listagem, detalhes e imagens bem-sucedidos retornam `Cache-Control: private, max-age=21600` e `Vary: Authorization, Cookie`, habilitando o cache no cliente. A CDN continua bloqueada por `CDN-Cache-Control: no-store` e `Vercel-CDN-Cache-Control: no-store`. Busca de membros, erros e escritas usam `no-store`. O cache é isolado por conta e permissões e removido ao sair ou expirar a sessão, conforme a política global em [http-cache-policy.md](http-cache-policy.md).

| Método | Caminho | Contrato |
| --- | --- | --- |
| GET | `/conversations?page=0` | `{ items, hasMore }`; cards sem imagens |
| GET | `/conversations/members?q=nome` | Até 10 membros `{ id, name }` |
| GET | `/conversations/:id?page=0` | `{ topic, items, hasMore }`; publicações com `hasImage`, sem bytes da imagem |
| GET | `/conversations/:id/image` | `{ image: dataUri }`; 404 para publicações excluídas |
| POST | `/conversations` | `{ title, body, image? }` → `{ id }` |
| POST | `/conversations/:id/replies` | `{ body, image? }` → `{ id, page }` (página da nova resposta) |
| DELETE | `/conversations/:id` | Exclusão lógica idempotente, após autorização → `{ deleted: true }` |

O campo `image` usa data URI base64 com MIME e assinatura coerentes. SVG e outros tipos não são aceitos. Não há edição de publicações nesta versão.

## Publicação

A migração `20261104150000_conversations` cria `conversation_posts`, índices e referências ao autor e ao tópico. Aplique pelo fluxo administrativo existente (`db:deploy`, que também concede privilégios ao runtime). Não requer serviço novo de armazenamento. O limite JSON da API é de 2 MB para comportar a imagem de 1 MB codificada em base64.
