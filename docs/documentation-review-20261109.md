# Revisão documental — 09/11/2026

## Escopo e critério

Revisados README, AGENTS, todos os Markdown próprios de docs e os cinco guias
de apps/api/prisma/library-production, além do OpenAPI, coleção Postman, patches
Windows e vínculos dos exemplos. A comparação usa fontes, schema/migrations,
rotas, contratos compartilhados, scripts e workflows deste checkout.

As skills em .agents/skills são material de ferramentas/provedores e foram
identificadas como tal, sem reescrever instruções externas nem tratá-las como
arquitetura implementada. Não foram consultados painéis de produção nem
revalidados preços, quotas ou documentação externa; valores voláteis foram
retirados das instruções de instalação. Não foram executadas operações em banco
ou contas reais. O aplicativo Windows externo não foi reconstruído.

## Correções principais

| Área             | Divergência corrigida                                                                                | Fontes principais                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Instalação       | Node de referência, exportação explícita de conexão administrativa e README sem contratos duplicados | .node-version, package.json, docker-compose.yml, database-security.cjs                 |
| Publicação       | Serviços web/API da raiz como configuração principal; dois projetos como alternativa                 | vercel.json e configurações dos workspaces                                             |
| Conta            | Cadastro pendente, campos obrigatórios, acesso básico e resposta completa de preferências            | auth.dto.ts, auth.service.ts, auth.guard.ts, users.controller.ts                       |
| Operações/e-mail | Outbox e envio automático de agendamentos já implementados                                           | notification-outbox.service.ts, notification-worker.controller.ts, notifications.yml   |
| Eventos          | Stripe Checkout existente, menu dentro de Datas e reembolsos administrativos separados               | event-signup.service.ts, AppShell.tsx                                                  |
| Biblioteca       | Modelo implementado, proveniência do inventário e preservação das regras de circulação               | schema.prisma, library.service.ts, library.policy.ts, prepare-seed.cjs                 |
| Financeiro       | Guia próprio, rotas atuais e vínculo fatura/despesa                                                  | finance.controller.ts, reports.service.ts, invoices.controller.ts, invoices.service.ts |
| Reembolsos       | Preparação de imagem de 768 KiB/2560 px e finalização em blocos                                      | pages/reimbursements/api.ts e submission.ts                                            |
| Cache            | Tabela de 140 rotas, incluindo sugestões de classificação sem cache                                  | packages/shared/src/http-cache-policy.ts                                               |
| Telemetria       | Status 401/403 históricos versus ingestão atual e separação da investigação de upload                | frontend-errors.service.ts e frontend-error-stats.ts                                   |
| Tradução         | Contrato do Ponte separado da versão do aplicativo externo; geração OpenAPI explícita                | live-translation e patches Windows                                                     |
| Histórico        | Deploys, investigações e resultados antigos separados de procedimentos atuais                        | archive/README.md                                                                      |

## Material mantido após conferência

Guias de conversas, passkeys, paginação da biblioteca, ministérios/escalas, PWA,
classificação bancária e dashboard financeiro continuam úteis. Foram preservados
os exemplos editoriais, patches Windows, coleção Postman e dados gerados.
O índice cobre todos os guias atuais e aponta as ferramentas especializadas.
Contagens de inventário descrevem a fonte, nunca um censo de produção.

## Verificação

O comando `npm run docs:check` (ou `node scripts/check-docs.mjs`), também incluído
no job de qualidade do CI, verifica destinos
locais de links/imagens em Markdown, a correspondência entre tabela de cache e
allowlist, e a reprodução do seed/relatório da biblioteca sem escrita no banco.
Não valida disponibilidade de URLs externas, âncoras ou semântica dos textos.

- Verificação documental: 74 Markdown com destinos locais válidos; 140 políticas de cache alinhadas; seed e relatório da biblioteca reproduzíveis.
- Controles negativos: link ausente, TTL divergente e relatório gerado alterado foram rejeitados; fixtures restauradas e verificação novamente aprovada.
- Seis testes Node aprovados: três do contrato-base OpenAPI e três do preparador do inventário.
- Compilação TypeScript do shared, compilação Nest da API e TypeScript sem emissão da API e frontend aprovados.
- OpenAPI recompilado conferido com `node scripts/openapi.mjs check --skip-build`: snapshot sincronizado, sem alteração manual.
- ESLint do verificador documental aprovado. Formatação dos guias reestruturados, script e workflow conferida com Prettier.
- Não foram executadas as suítes completas de aplicação, integrações PostgreSQL, build Vite ou testes com provedores/dispositivos: não houve mudança de comportamento da aplicação.

O executável npm não estava no PATH deste terminal. As verificações usaram diretamente as CLIs instaladas em node_modules por Node; os comandos npm documentados permanecem válidos em ambiente com os requisitos instalados. A compilação Nest usada no check não inclui o empacotamento/preflight Chromium do script completo de build da API.

A tarefa altera documentação e ferramentas de verificação documental. Não altera
a aplicação nem APP_VERSION, schema, permissões ou contratos de runtime.
