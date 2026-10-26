# Aprovação de novos cadastros

`POST /auth/register` exige nome, e-mail, senha (mínimo 12 caracteres), `phone` (7 a 15 dígitos, com espaços, parênteses, hífens e prefixo + opcionais) e `birthDate` (data válida YYYY-MM-DD, não futura). Telefone e nascimento ficam no membro vinculado, criado na mesma transação da conta.

O cadastro público cria a conta em `PENDING_APPROVAL`. Contas existentes e cadastros administrativos não mudam. Login, refresh, recuperação de senha, preferências e passkeys funcionam nesse estado; as permissões retornadas são vazias mesmo se uma função tiver sido atribuída à conta. O guard global nega por padrão os demais endpoints autenticados: somente vídeos e aniversariantes são liberados como conteúdo. Financeiro (incluindo resumos e reembolsos), biblioteca, vida da igreja, notificações e gestão ficam bloqueados também por chamadas diretas à API. Rotas públicas continuam públicas.

A interface oferece início (aviso de espera, vídeos e aniversariantes), vídeos e minha conta. Rotas diretas e menus seguem a mesma política; a tela de reembolso isolada também é bloqueada.

Administradores (`SUPER_ADMIN`, `ADMIN`) e pastores (`PASTOR`) ativos têm a **Lista de espera** no menu Pessoas:

- `GET /users/pending-approvals?page=1&pageSize=20&search=...`: lista paginada por ordem de cadastro, com nome, e-mail, telefone e nascimento, sem senha ou tokens.
- `POST /users/:id/approve`: altera somente uma conta pendente para `ACTIVE`. Usa transação, bloqueio da linha e contexto de auditoria; uma segunda aprovação retorna 409. A aprovação remove funções previamente atribuídas e concede somente o acesso padrão de membro. A conta passa a usar as permissões de membro na próxima requisição; a interface atualiza a sessão ao recarregar a página ou entrar novamente.
- A alteração genérica de status não aprova contas pendentes; use o endpoint de aprovação.

Aplique a migration `20261026120000_pending_approval` antes de publicar a API. Ela acrescenta um valor ao enum; não reclassifica contas antigas. Nenhuma mudança de produção é executada pelo desenvolvimento local.

## Verificações locais

- Prisma Client gerado com o novo enum; TypeScript da API e do frontend e ESLint dos arquivos alterados aprovados.
- Testes HTTP e de serviço em `pending-approval.spec.ts`: autorização, aprovação repetida, conta removida, paginação, login/refresh, permissões após aprovação, persistência do payload e validação dos campos; banco simulado.
- Testes de segurança de autenticação, passkeys e aniversariantes, além dos testes de interface de cadastro, lista de espera, rotas, painel, membros, aparência e passkeys.
- As fixtures PostgreSQL foram atualizadas para informar telefone/nascimento e preparar explicitamente contas aprovadas quando necessário. A suíte de integração de autenticação foi ignorada por ausência de `TEST_DATABASE_URL`; a migration não foi executada num banco real nesta tarefa.

A versão da aplicação passa a `1.0.0`, pois o cadastro público passa a exigir dois campos adicionais, incompatíveis com o payload antigo.

O build `1.0.1` inclui o pacote CommonJS compartilhado na conversão do Vite, permitindo usar a mesma regra de aprovação no frontend e na API.

Na publicação de 26/10/2026, a migration foi aplicada na branch `production` do projeto Neon APonte. Como a conexão direta encerrou a negociação TLS, o conector Neon executou o SQL e o registro em `_prisma_migrations` na mesma transação, com o checksum SHA-256 do arquivo. `runtime-privileges.sql` foi reaplicado; o login `church_app` reconhece o novo enum e continua sem UPDATE na auditoria.
