# CI e testes locais

O workflow `.github/workflows/ci.yml` roda em pull requests, pushes na `main` e
acionamento manual. Existem dois checks independentes:

- **TypeScript, lint, unit tests and build:** instala pelo lockfile, gera Prisma,
  compila contratos compartilhados, verifica TypeScript/lint, executa testes sem
  banco e cria os builds de produção.
- **PostgreSQL integration and restricted login:** executa as suítes reais com
  PostgreSQL 17 descartável e verifica também os privilégios do login de execução.

Node está definido em `.node-version`. O CI não usa segredos de produção, não
publica coleções, não faz deploy e não altera regras de proteção de branches.
Para bloquear merges com falhas, configure ambos os checks como obrigatórios
nas regras da `main` após o primeiro workflow publicado.

## Executar localmente

Requisitos: Node da `.node-version`, npm e Docker com Compose v2 e suporte a
`up --wait`. Execute na raiz:

```sh
npm ci
npm run test:unit
npm run test:integration
npm run typecheck
npm run lint
npm run build
```

`npm test` executa os testes sem banco e depois a integração. Os testes da API
sem banco incluem os testes HTTP de health com Prisma simulado e os testes
Node do worker e-Fatura; os testes do frontend usam Vitest/jsdom.

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

## Validação desta implementação — 27/10/2026

| Verificação                                                   | Resultado                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Instalação limpa com `npm ci` em container Linux Node 24.15.0 | Passou; auditoria da instalação sem vulnerabilidades reportadas           |
| TypeScript da API e frontend (`npm run typecheck`)            | Passou                                                                    |
| Lint completo (`npm run lint`)                                | Passou                                                                    |
| API sem banco (`jest.unit.config.cjs`)                        | 50 suítes, 426 testes passaram                                            |
| HTTP/seed com PostgreSQL 17 descartável                       | 10 suítes, 138 testes passaram                                            |
| Login restrito e privilégios (`--security-only`)              | 13 testes passaram                                                        |
| Frontend (`npm run test --workspace @church/web`)             | 47 arquivos, 341 testes passaram                                          |
| Worker e-Fatura no Windows                                    | 12 testes passaram; o teste com Chromium real foi ignorado por plataforma |
| Chromium real em container Linux, rede da página bloqueada    | 1 teste passou, sem ignorados                                             |
| Build completo e nova compilação do frontend com versão 1.1.4 | Passaram                                                                  |
| YAML do workflow, gatilhos, jobs e permissões                 | Verificados localmente                                                    |
| Falta de `TEST_DATABASE_URL` no setup de integração           | Falha explícita confirmada                                                |

Os testes foram executados por etapas; a suíte de privilégios foi repetida com
`--security-only` após corrigir seu acesso ao papel administrativo. Os projetos
PostgreSQL criados pelo runner foram removidos ao finalizar.

As fixtures foram atualizadas para a criação automática de identidades, vínculo
obrigatório de ministérios nas escalas e regras atuais de autorização. Testes da
interface aguardam o conteúdo principal antes de procurar elementos de páginas
carregadas sob demanda. O teste de erro em uploads continua garantindo um único
POST, permitindo a consulta independente de atualização da aplicação.

Não houve execução observada no GitHub Actions, push, deploy ou teste de provedores
reais de e-mail/pagamento/portal e-Fatura. O build ainda emite o aviso existente de
chunks maiores que 500 kB; isso não impediu a compilação.
