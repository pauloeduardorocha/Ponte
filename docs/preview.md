# Preview isolado do PR de segurança

Configuração de 20 de outubro de 2026, sem alteração do plano Free.

- Organização Neon: `org-raspy-wind-22361211`.
- Projeto: `APonte Preview` (`falling-forest-35583071`).
- Região: AWS Frankfurt; PostgreSQL 18.
- Branch: `preview` (`br-proud-night-ba8t4gbp`).
- Base: `church_preview`, criada vazia, sem copiar dados de produção.
- Login administrativo: `preview_owner`, utilizado apenas na preparação.
- Login da API: `church_app`, com os privilégios limitados de `church_runtime`.
- Compute configurado com mínimo e máximo de 0,25 CU; os limites e suspensão
  continuam sujeitos ao plano gratuito.

A conta tinha um projeto antes desta criação. A tabela oficial consultada nesta
data permite 100 projetos, com 1 GB e 100 CU-horas mensais por projeto:
https://neon.com/pricing. Não foi ativada faturação nem efetuado upgrade.

## Vercel

As variáveis pertencem exclusivamente ao ambiente Preview da branch Git
`codex/database-security`, no projeto `ponte`:

- `DATABASE_URL`: ligação com pool do login limitado, guardada como Secret.
- `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET`: valores novos e exclusivos,
  guardados como Secret.
- `PRIVATE_STORAGE_DRIVER=database`.
- `NODE_ENV=production`, para exercer a verificação de segurança no arranque.
- `CORS_ORIGIN`: origem do alias estável do preview.

Alias estável:
https://ponte-git-codex-1b4faf-paulo-eduardo-araujo-da-rochas-projects.vercel.app

As variáveis de produção, o `.env` local e o contexto `.neon` não foram alterados.
As credenciais administrativas não foram adicionadas à Vercel nem ao Git. O
ficheiro temporário usado para transferir as credenciais novas foi removido.

## Estrutura e validação inicial

As 34 migrations foram aplicadas por Prisma Migrate pela ligação administrativa
direta. O provisionamento criou o login limitado e a verificação de privilégios
da API passou. Foram confirmados zero utilizadores e zero membros antes dos
testes HTTP; não foram executados seeds nem importações de produção.

O comando completo `database-security.cjs deploy` também foi executado com
sucesso neste projeto, validando a reaplicação dos privilégios. A limitação do
Prisma CLI Windows com PostgreSQL no WSL registada na revisão anterior não
impediu esta validação contra o Neon.

Novas migrations exigem a ligação direta de `preview_owner` em
`ADMIN_DATABASE_URL` num processo administrativo explícito. A API continua a
usar apenas o login limitado. Não executar migrations através das credenciais
de produção para preparar este preview.

Este ambiente fica disponível para validação do PR. A remoção do projeto ou
dos seus dados deve ser uma ação explícita após deixar de ser necessário.
