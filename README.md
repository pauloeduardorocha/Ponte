# Ponte

Sistema de gestão da igreja em monorepo npm: API NestJS/Prisma/PostgreSQL, frontend React/Vite/MUI e contratos compartilhados. Inclui contas e aprovação, membros e famílias, comunidade, biblioteca, eventos, ministérios, escalas, financeiro, reembolsos e auditoria.

A [documentação por assunto](docs/README.md) separa guias atuais e registros históricos. Os contratos HTTP são gerados em [OpenAPI](docs/openapi.json).

## Requisitos e estrutura

Use o Node de [.node-version](.node-version) (24.15.0) e npm 10 ou superior. O mínimo declarado em `package.json` é Node 22.17. Docker com Compose v2 é necessário para a stack completa e os testes reproduzíveis com banco descartável. O Compose local usa PostgreSQL 17; o ensaio de recuperação usa PostgreSQL 18.

| Diretório         | Conteúdo                                                  |
| ----------------- | --------------------------------------------------------- |
| `apps/api`        | API, Prisma, migrations, testes e scripts administrativos |
| `apps/web`        | Interface, PWA e testes de componentes                    |
| `packages/shared` | Tipos, permissões e políticas compartilhadas              |
| `scripts`         | Contratos, integração e recuperação                       |
| `docs`            | Guias, contratos gerados, exemplos e histórico            |

## Desenvolvimento local

```powershell
Copy-Item .env.example .env
# Configure conexões locais e segredos próprios no arquivo privado.
npm ci
docker compose up -d postgres
npm run db:generate
# Injete ADMIN_DATABASE_URL no ambiente privado antes deste comando.
npm run db:deploy --workspace @church/api
npm run build --workspace @church/shared
npm run dev
```

A API carrega `.env` pelo ConfigModule; os scripts administrativos de segurança **não o carregam automaticamente**. Copiar `.env` não exporta `ADMIN_DATABASE_URL` para o PowerShell. O exemplo conecta ao PostgreSQL em `localhost:5432`; ajuste as conexões se usar outra porta. Use somente banco local/de desenvolvimento.

- Web: <http://localhost:5173>.
- API: <http://localhost:3000/api/v1>.
- Saúde: <http://localhost:3000/api/v1/health>.
- Swagger: <http://localhost:3000/api/v1/docs>, fora de produção.

O Vite encaminha `/api` para a API em `localhost:3000`. O frontend usa essa origem compartilhada para o cookie de refresh.

## Stack Docker

Configure em `.env` `POSTGRES_PASSWORD`, segredos JWT distintos e `RUNTIME_DATABASE_PASSWORD` aleatório com pelo menos 48 caracteres base64url. Use senhas diferentes para proprietário e API.

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f api
docker compose down
```

`db-init` aplica migrations, reaplica privilégios e cria `church_app` se ausente; não troca uma senha existente. A API aguarda a preparação e o frontend Nginx aguarda a saúde da API. O Nginx encaminha `/api/` sem expor o hostname interno ao navegador. Os volumes contêm banco e anexos locais; removê-los apaga esses dados.

## Migrations e demonstração

```sh
npm run db:generate
npm run db:migrate -- --name nome_da_migration
npm run db:deploy --workspace @church/api
npm run db:studio
```

`db:migrate` usa `prisma migrate dev`, exclusivamente em desenvolvimento. `db:deploy` exige `ADMIN_DATABASE_URL` direto do proprietário e reaplica privilégios; a API de produção recebe apenas `DATABASE_URL` do login limitado. Ver [segurança do banco](docs/database-security.md).

O seed não roda automaticamente no arranque ou build. Para banco local **descartável**, configure `NODE_ENV=development`, `SEED_DEMO=true` e `SEED_DEMO_PASSWORD` com 12–128 caracteres; execute `npm run db:seed` após compilar o shared. Cria contas fictícias `@ponte.example` e exemplos dos módulos. Não há senha padrão. Reexecuções preservam senhas e registros já editados. No Compose, o serviço `seed` está no perfil explícito `demo`.

O [inventário da biblioteca](apps/api/prisma/library-production/README.md) é um fluxo administrativo separado do seed demo; seus comandos de reset apagam o histórico operacional da biblioteca e não fazem parte da instalação normal.

## Verificações

```sh
npm run docs:check
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run test:recovery
npm run build
npm run openapi:check
```

O [guia de CI](docs/ci.md) explica bancos temporários, requisitos e execuções focadas. `npm test` reúne testes unitários e integração; recuperação é um modo separado. Não use conexões de produção para testes.

## Acesso e operação

O cadastro público exige nome, e-mail, senha, telefone e nascimento e cria conta `PENDING_APPROVAL`. Administrador ou pastor aprova pela Lista de espera. Contas ativas têm acesso básico de membro; gestão usa permissões e escopos validados pela API. A gestão de acesso fica na ficha do membro; `/users` redireciona para `/members`. Ver [aprovação](docs/pending-approvals.md) e [cadastro unificado](docs/unified-members.md).

O frontend mantém o access token em memória; o refresh usa cookie HttpOnly. Use HTTPS e proxy na mesma origem em produção. Consulte [autenticação, auditoria e privacidade](docs/SECURITY_REVIEW.md).

A configuração principal da Vercel fica em [vercel.json](vercel.json), com serviços `web` e `api` no mesmo projeto. Os arquivos nos workspaces oferecem a alternativa de projetos separados. Ver [publicação](docs/vercel-deployment.md), [backup e recuperação](docs/backup-recovery.md) e [notificações](docs/notifications.md). Build e arranque não executam migrations nem criam administradores.

Configurações privadas e contas dos provedores são mantidas fora do Git. Domínio/DNS, Vercel, Neon e Bird devem ser consultados nos painéis pelos responsáveis; limites, planos e consumo não são fixados nesta documentação.

## Manutenção

Siga [AGENTS.md](AGENTS.md). Alterações da aplicação incrementam `APP_VERSION` do frontend; rodapé e relatórios usam o mesmo valor. Alterações somente de documentação não alteram a versão do produto. Ao mudar comportamento, atualize o guia correspondente e regenere o OpenAPI quando houver mudança de contrato. O [plano técnico](docs/technical-improvements.md) registra limitações identificáveis no código.
