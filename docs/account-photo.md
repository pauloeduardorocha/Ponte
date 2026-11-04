# Foto da conta

Em Minha conta → Dados da conta, use Alterar foto ou Remover foto. O avatar do menu é atualizado após salvar com sucesso. Falhas preservam a foto anterior.

O navegador aceita JPEG, PNG e WebP até 20 MB, redimensiona para no máximo 1024 pixels no maior lado e recodifica como JPEG sem metadados, reduzindo qualidade e dimensões até no máximo 500.000 bytes (0,5 MB). Transparência recebe fundo branco.

PATCH /api/v1/auth/preferences aceita avatar como data URL JPEG (base64) ou null para remover. A API valida formato, assinatura e limite decodificado; o usuário vem da sessão autenticada, sem permissão administrativa. A resposta usa Cache-Control: no-store. A foto é armazenada em users.avatar (TEXT), junto ao usuário, e retornada nos fluxos de autenticação e /auth/me. Não é incluída na listagem administrativa de usuários.

Antes de iniciar a versão nova, aplicar a migração 20261104120000_user_avatar pelo fluxo existente de db:deploy. A migração adiciona coluna opcional e limite de tamanho; contas existentes continuam com iniciais. Outras sessões recebem a foto atualizada na próxima restauração. Esta tarefa não aplica a migração em produção.
