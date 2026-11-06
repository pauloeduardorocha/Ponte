# Painéis de conversas

Contas com status `ACTIVE` podem consultar, criar e responder a conversas na página inicial, independentemente de permissões administrativas. Contas pendentes, desativadas e visitantes não têm acesso à API nem à página de detalhes.

A página inicial apresenta até 20 conversas recentes em cards com rolagem horizontal, sem botões de anterior/próxima. As mais recentes aparecem primeiro, por data de criação. O link “Ver todas as conversas” abre `/conversations`, que apresenta cards em uma grade responsiva e carrega mais 20 por clique.

A página `/conversations/:id` tem formato de post social: cabeçalho com autor e data, título, texto/imagem e comentários em balões. Comentários aparecem dos mais recentes para os mais antigos. “Mostrar mais comentários” acrescenta dez por vez sem substituir os já exibidos. Cada comentário tem a ação “Responder”; suas respostas ficam na mesma conversa e aparecem recuadas, também carregadas de dez em dez. Não há paginação numerada. Para manter a leitura em telas pequenas, o recuo visual deixa de aumentar após três níveis, preservando o vínculo entre as mensagens.

Listagem, detalhes, imagens e respostas a comentários usam cache privado no cliente com TTL de 6 horas, persistido entre recargas pelo mesmo CacheStorage dos demais endpoints. Não há polling. Criar, responder ou excluir invalida o cache; “Atualizar” também força nova leitura. Alterações de outras sessões aparecem após expirar o TTL ou atualizar manualmente.

Cada publicação aceita texto de até 10.000 caracteres e uma imagem PNG, JPEG ou WebP de até 1.048.576 bytes (1 MB). Títulos têm até 160 caracteres. Imagens são persistidas com a publicação e consultadas separadamente por endpoint autenticado; não existem URLs públicas de anexos. Links HTTP/HTTPS são clicáveis, com abertura em outra aba. HTML é exibido como texto.

Digite `@` e pelo menos duas letras para buscar membros ativos, inclusive membros sem conta. O editor exibe `@Nome` e converte a seleção em uma referência `@[Nome](UUID)` apenas ao enviar. Membros com nomes iguais recebem um sufixo numérico no editor para distinguir as seleções. A API valida até 20 referências distintas por publicação. Apenas ID e nome são expostos pela busca, sem informações de contato. Os nomes exibidos são resolvidos a partir do cadastro atual; membros inativos ou anonimizados aparecem como “membro indisponível”. As menções não enviam notificações nesta versão.

Somente o autor da publicação ou usuários com papel `ADMIN`/`SUPER_ADMIN` podem excluí-la. A exclusão é lógica: texto, imagem, autor, data e referências permanecem no banco, com `deletedAt` e `deletedBy`; as respostas continuam vinculadas. A API pública autenticada oculta título, texto, imagem e menções do registro excluído. A interface mostra “conversa excluída” ou “mensagem excluída”, preservando autor e data. Uma conversa excluída mantém os comentários existentes visíveis, mas não aceita novos comentários ou respostas. Comentários excluídos preservam as respostas existentes, mas não aceitam novas respostas diretas. A autoria da conversa ou de um comentário não autoriza excluir respostas de outras pessoas.

## Contrato HTTP

Todos os endpoints usam o prefixo `/api/v1` e exigem sessão de conta aprovada. GETs da listagem, detalhes, respostas e imagens bem-sucedidos retornam `Cache-Control: private, max-age=21600` e `Vary: Authorization, Cookie`, habilitando o cache no cliente. A CDN continua bloqueada por `CDN-Cache-Control: no-store` e `Vercel-CDN-Cache-Control: no-store`. Busca de membros, erros e escritas usam `no-store`. O cache é isolado por conta e permissões e removido ao sair ou expirar a sessão, conforme a política global em [http-cache-policy.md](http-cache-policy.md).

| Método | Caminho | Contrato |
| --- | --- | --- |
| GET | `/conversations?page=0` | `{ items, hasMore }`; cards sem imagens |
| GET | `/conversations/members?q=nome` | Até 10 membros `{ id, name }` |
| GET | `/conversations/:id?page=0&order=desc` | `{ topic, items, hasMore }`; dez comentários de primeiro nível, com `parentId`, `hasImage` e `_count.children`, sem bytes da imagem |
| GET | `/conversations/:id/replies?parentId=UUID&page=0&order=desc` | `{ items, hasMore }`; dez respostas diretas ao comentário, com validação do vínculo à conversa |
| GET | `/conversations/:id/image` | `{ image: dataUri }`; 404 para publicações excluídas |
| POST | `/conversations` | `{ title, body, image? }` → `{ id }` |
| POST | `/conversations/:id/replies` | `{ body, image?, parentId? }` → `{ id, page }`; sem `parentId`, comenta o tópico; com ele, responde a um comentário ativo da mesma conversa |
| DELETE | `/conversations/:id` | Exclusão lógica idempotente, após autorização → `{ deleted: true }` |

O campo `image` usa data URI base64 com MIME e assinatura coerentes. SVG e outros tipos não são aceitos. Não há edição de publicações nesta versão. Consultas de comentários aceitam `order=asc|desc`; omitir `order` mantém a ordem cronológica antiga para compatibilidade. O campo `page` retornado na criação continua referindo-se à posição entre irmãos em ordem crescente, para clientes antigos; a interface atual recarrega as mensagens mais recentes no início.

## Publicação

A migração `20261104150000_conversations` cria `conversation_posts`, índices e referências ao autor e ao tópico. A migração `20261104235000_conversation_comment_replies` acrescenta `parentId`, chave estrangeira, índice de respostas e proteção contra autorreferência ou associação de um tópico como filho. Mensagens anteriores continuam como comentários de primeiro nível, sem perda de conteúdo. Aplique as migrações antes de publicar a nova API, pelo fluxo administrativo existente (`db:deploy`, que também concede privilégios ao runtime). Não requer serviço novo de armazenamento. O limite JSON da API é de 2 MB para comportar a imagem de 1 MB codificada em base64.
