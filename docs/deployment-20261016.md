# Publicação de 16 de outubro de 2026

- Aplicação: https://ponte-umber.vercel.app
- Projeto Vercel: `ponte` (`prj_h3QXUzdVpx6HvA7mwlf5Wc39ohC0`).
- Deploy: `dpl_7ZASW5RKUznJ52hJ9jhRgVm3W3HP`.
- Artefacto: https://ponte-1ppg2o38t-paulo-eduardo-araujo-da-rochas-projects.vercel.app
- Publicado a partir de todo o diretório de trabalho, incluindo alterações pendentes de outros chats. Não foi criado um commit Git.

## Migrações

As 33 migrações anteriores já estavam concluídas em produção. A migration `20261016140000_passkeys` foi primeiro aplicada numa cópia temporária da branch de produção e depois aplicada com `prisma migrate deploy` na branch `production` do projeto Neon `proud-dream-93315359`, através da ligação direta. Confirmadas as duas tabelas e permissões de acesso da role utilizada pela ligação. Não foram executados seeds em produção.

## Verificação

- Build completo de shared, API e frontend/PWA: passou, localmente e na Vercel.
- Testes específicos de passkeys, segurança de autenticação e contrato HTTP: passaram no desenvolvimento; 26 testes de API e 3 de interface após a última adição de testes.
- e-Fatura: 13 testes passaram.
- Duas expectativas antigas de interface foram atualizadas: recursos pessoais de reembolsos no menu e tratamento de erro no seletor completo de entidades. Reexecução: 24 testes passaram.
- Produção: `/login`, `/manifest.webmanifest`, `/sw.js` e `/api/v1/health` responderam 200; API e base saudáveis.
- Produção: opções de login com passkey responderam 200 com RP ID `ponte-umber.vercel.app` e `userVerification: required`; origem não permitida respondeu 403; listagem de credenciais sem autenticação respondeu 401.

## Limitações conhecidas da validação

A suíte completa da API contra a cópia temporária do Postgres terminou com 225 testes aprovados e 91 falhados (24 suítes aprovadas e 10 falhadas). Os erros incluem conflitos de advisory lock, tempos limite de ligação/transações e expectativas anteriores à unificação de membros/contas. O teste de inscrição paga também mantém uma divergência no tipo de erro esperado. A tentativa de repetir integrações no Postgres local foi impedida pela ligação do schema engine Windows ao Postgres no WSL. Assim, a suíte completa não constitui uma validação aprovada desta publicação.

É necessário testar a confirmação biométrica em Android/iPhone reais, no navegador e no PWA instalado. A aplicação não acede aos dados biométricos.


## Atualização do menu de eventos

- Produção: https://ponte-umber.vercel.app.
- Deploy: `dpl_8uBBp6ttD7dATc5uzmAPZSNExxea` (READY), promovido após verificação do login e health check.
- Origem: diretório de trabalho sobre `daf6293`, sem novo commit, seguindo a publicação anterior.
- Menu: retirada dos seis atalhos para `/my-events`; a entrada Meus eventos permanece ativa em todas as abas e usa EVENT_READ.
- Validação: 26 testes de interface aprovados, ESLint e TypeScript aprovados, build completo local e remoto aprovado.
- Após promoção: login, my-events, manifesto PWA, service worker e health check responderam 200. API e base de dados disponíveis. Bundle público confirmado com a entrada Meus eventos e sem os seis atalhos removidos.
- Sem migrações ou seeds nesta atualização. A navegação autenticada não foi verificada manualmente em produção.


## Eventos em Recursos

- Deploy de produção: `dpl_EqNS2Lg5LYYDfsQsCzfVzhCKCqiA` (READY), promovido para https://ponte-umber.vercel.app.
- Agenda de eventos e Gestão de eventos movidos para Recursos; removido o agrupamento Eventos. Títulos das páginas atualizados.
- Validação: 30 testes aprovados, ESLint e TypeScript aprovados; build remoto aprovado. Login e health check verificados antes e após promoção. Bundle público confirmado com ambos os nomes em Recursos e sem Meus eventos.
- Sem migrações ou seeds. Publicação do diretório de trabalho, sem novo commit. Navegação autenticada não testada manualmente em produção.

## Card de aniversariantes do dia

- Deploy: `dpl_3C2gsVGbfZqVsSjSYHnqHwQNkTVn` (READY), promovido para https://ponte-umber.vercel.app.
- Card na página inicial para qualquer membro autenticado; consulta por dia e mês em Europe/Lisbon, apenas membros ativos não anonimizados, sem expor data de nascimento ou idade.
- Build local e remoto aprovados; 6 testes da página inicial e 3 testes HTTP da API aprovados.
- Antes da promoção: login 200, health 200 com API e banco disponíveis, endpoint de aniversariantes 401 sem login.
- Após promoção: mesmas verificações aprovadas no domínio público; bundle confirmado com o card e a chamada ao endpoint.
- Sem migrações ou seeds. Publicação do diretório de trabalho sobre `daf6293`, sem novo commit. Visualização autenticada em produção não verificada manualmente.

## Cards pessoais responsivos

- Deploy `dpl_6FKpvKNV7KkBMtZFMDyrZA8reTcT` promovido para https://ponte-umber.vercel.app.
- Aniversariantes e cards pessoais compartilham uma grade de duas colunas a partir de 1200 px; uma coluna abaixo disso.
- TypeScript e ESLint aprovados; build remoto aprovado. Login 200 e API/banco saudáveis antes/depois da promoção.
- Chrome headless sobre os assets publicados, com sessão e dados de membro simulados por interceptação local: duas colunas em 1440 px, uma coluna em 1024/768/390 px, sem overflow horizontal. Não utilizou credenciais nem alterou dados reais.
- Reexecução dos testes Vitest da página inicial ficou sem resposta e foi interrompida; a verificação de layout no navegador passou.
- Sem migrações ou seeds; publicação do diretório de trabalho sem novo commit.
