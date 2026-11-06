# Foto da conta

Em Minha conta → Dados da conta, use Alterar foto ou Remover foto. O avatar do menu é atualizado após salvar com sucesso. Falhas preservam a foto anterior.

O navegador aceita JPEG, PNG e WebP até 20 MB, redimensiona para no máximo 1024 pixels no maior lado e recodifica como JPEG sem metadados, reduzindo qualidade e dimensões até no máximo 500.000 bytes (0,5 MB). Transparência recebe fundo branco.

PATCH /api/v1/auth/preferences aceita avatar como data URL JPEG (base64) ou null para remover. A API valida formato, assinatura e limite decodificado; o usuário vem da sessão autenticada, sem permissão administrativa. A resposta usa Cache-Control: no-store. A foto é armazenada em users.avatar (TEXT), junto ao usuário, e retornada nos fluxos de autenticação e /auth/me. Não é incluída na listagem administrativa de usuários.

Antes de iniciar a versão nova, aplicar a migração 20261104120000_user_avatar pelo fluxo existente de db:deploy. A migração adiciona coluna opcional e limite de tamanho; contas existentes continuam com iniciais. Outras sessões recebem a foto atualizada na próxima restauração. Esta tarefa não aplica a migração em produção.

## Exibição na comunidade

A foto da conta aparece no ícone da navbar, nos cards de conversas, no autor do tópico e nos comentários e respostas, além da lista de aniversariantes. Sem foto, a interface mantém as iniciais. As conversas retornam `author.avatar` (data URL JPEG ou null); identidades excluídas ou anonimizadas não expõem foto. Os aniversariantes do dia e da semana retornam `avatar` da conta não excluída vinculada ao membro, sem exigir que todo membro tenha conta. As permissões existentes permanecem. Dados já em cache recebem a foto ao atualizar a consulta ou expirar o cache.
