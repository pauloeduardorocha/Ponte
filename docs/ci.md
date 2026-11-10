# CI e testes locais

O workflow `.github/workflows/ci.yml` roda em pull requests, pushes na `main` e
acionamento manual. Existem dois checks independentes:

- **TypeScript, lint, unit tests and build:** instala pelo lockfile, verifica a
  documentação com `npm run docs:check`, gera Prisma,
  compila contratos compartilhados, verifica TypeScript/lint, executa testes sem
  banco e cria os builds de produção.
- **PostgreSQL integration and restricted login:** executa as suítes reais com
  PostgreSQL 17 descartável e verifica também os privilégios do login de execução.
  Inclui um segundo ensaio com PostgreSQL 18, backup
  encriptado, restauro e verificação da API e dos documentos recuperados.

Node está definido em `.node-version`. O CI não usa segredos de produção, não
publica coleções, não faz deploy e não altera regras de proteção de branches.
Para bloquear merges com falhas, configure ambos os checks como obrigatórios
nas regras da `main`. A existência do YAML não comprova que a proteção esteja ativa.

## Executar localmente

Requisitos: Node da `.node-version`, npm e Docker com Compose v2 e suporte a
`up --wait`. Execute na raiz:

```sh
npm ci
npm run test:unit
npm run test:integration
npm run test:recovery
npm run typecheck
npm run lint
npm run build
```

`npm test` executa os testes sem banco e depois a integração. Os testes da API
sem banco incluem os testes HTTP de health com Prisma simulado e os testes
Node do worker e-Fatura; os testes do frontend usam Vitest/jsdom.

Para verificar especificamente notificações/outbox, execute
`npm run test:integration -- --notifications-only`: são incluídos os testes reais
de notificações, operação e falhas da outbox, seguidos da verificação do login
restrito. O CI normal também executa essas suítes na integração completa.

## PostgreSQL de testes

`npm run test:integration` prepara o shared/Prisma e executa
`scripts/test-integration.mjs`, que:

1. Gera nome de projeto Compose, banco e senhas aleatórias por execução.
2. Inicia somente o serviço de `docker-compose.test.yml`, sem carregar o `.env`
   da aplicação. O PostgreSQL usa armazenamento temporário e porta dinâmica em
   `127.0.0.1`, sem interferir no Compose principal nem na porta 5432 existente.
3. Aguarda o health check e extrai a porta com `docker compose port`.
4. Monta `DATABASE_URL` e `TEST_DATABASE_URL` para esse container. Credenciais
   são temporárias, não são versionadas nem impressas; o log mostra somente
   host/porta/banco.
5. Aplica todas as migrations e executa as suítes reais em série. Algumas suítes
   também criam seus próprios schemas, conforme seus mecanismos existentes.
6. Provisiona `church_app` com os grants de produção no banco descartável e roda
   `database-runtime.e2e-spec.ts` separadamente, com as URLs administrativas/de
   execução locais e um hostname de produção sentinela que não corresponde ao local.
7. Remove o projeto de testes e seu armazenamento no bloco de finalização,
   incluindo quando uma verificação falha normalmente.

Não é necessário copiar URLs ou configurar `TEST_DATABASE_URL` manualmente.
Conexões externas herdadas são substituídas pelas do container desta execução.
O nome `ponte_push_test_<hex>` atende à proteção já exigida pela suíte de notificações.

Para repetir somente a suíte de privilégios, mantendo a criação de um container
novo, migrations e provisionamento dos grants, use
`npm run test:integration -- --security-only`. O CI e `npm test` executam todas as suítes.

No Windows, o runner usa `docker.exe` quando disponível. Se o Docker estiver
instalado apenas no WSL, usa `wsl.exe`, passa as variáveis do Compose explicitamente
e mantém uma sessão WSL aberta até terminar os testes. O CI Linux usa Docker nativo.
Os comandos que geram o Prisma e os testes da API devem rodar em sequência no mesmo
checkout: no Windows, o engine nativo fica bloqueado enquanto está em uso.

Se o processo for terminado à força antes da finalização, localize o projeto
`ponte-test-<hex>` no Docker e remova somente os seus recursos. Outros containers
e volumes locais não pertencem ao runner.

## Organização das suítes da API

- `jest.unit.config.cjs`: `src/**/*.spec.ts`, `test/**/*.spec.ts` e o health HTTP
  com banco simulado.
- `jest.integration.config.cjs`: `test/**/*.e2e-spec.ts`, exceto health.
- A integração exige `TEST_DATABASE_URL` no setup, evitando sucesso aparente por
  falta de configuração. Use o runner para provisionar o destino correto.
- O comando legado `npm run test --workspace @church/api` continua disponível
  para operadores com banco descartável já preparado e URL explícita; para o
  fluxo reproduzível, prefira os comandos da raiz.

Um resultado local não comprova uma execução no GitHub Actions. O build Linux
também executa o preflight Chromium do e-Fatura, que é omitido no Windows pelo
script de build existente.

Os testes Node do e-Fatura verificam também as operações reais do navegador
(formulário, clique, espera e extração de tabela) com HTML local e rede bloqueada.
Esse teste roda no Linux ou quando `PUPPETEER_EXECUTABLE_PATH` está configurado;
nos demais ambientes aparece explicitamente como ignorado. Comparar apenas os
majors de Puppeteer e Chromium não verifica essa compatibilidade operacional.
O teste não confirma compatibilidade com todas as APIs do Puppeteer nem faz
consultas ao portal e-Fatura.

## Contratos reproduzíveis

O mesmo job de qualidade verifica `npm run openapi:check -- --skip-build` após o
build, valida o schema com oasdiff e, em PRs, compara com o SHA da base. A geração
normal usa `npm run openapi:generate`; não precisa de `.env`, banco ou provedores.
A migração inicial do snapshot legado é explícita e limitada a hashes conhecidos;
as bases geradas bloqueiam incompatibilidades ERR. Ver [contratos da API](api-contracts.md).

`npm run test:unit` inclui também os testes do comando de preparação da base.
Os globs do Jest ficam limitados aos roots da API e não interpolam o caminho
absoluto com `<rootDir>` no `testMatch`, evitando a falha de descoberta em
worktrees Windows dentro de `.codex`. O setup e as exclusões continuam iguais.
