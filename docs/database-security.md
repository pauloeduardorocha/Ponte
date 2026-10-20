# Segurança da base de dados — 16 de outubro de 2026

## Acesso da aplicação

O login `church_app` herda apenas o grupo `church_runtime` (NOLOGIN).
Nenhum deles pode criar bases de dados, administrar papéis, contornar RLS,
possuir tabelas, criar objetos no schema público ou criar tabelas temporárias.
A aplicação tem SELECT/INSERT nos registos de auditoria, sem UPDATE, DELETE,
TRUNCATE, TRIGGER ou REFERENCES. Não tem acesso a `_prisma_migrations`.
As funções da aplicação usam um `search_path` fixo para evitar redirecionamento
de referências por chamadas com um caminho de procura diferente.

Os controlos de utilizador e permissões continuam no servidor. O login da base
consegue consultar os dados de todas as áreas; não constitui isolamento por
membro ou por igreja. RLS não foi ativada sem políticas e propagação de identidade
transacional próprias. Uma credencial roubada ainda permite aceder a dados da
aplicação; a separação limita principalmente alterações estruturais, privilégios
e destruição da auditoria.

`PrismaService` verifica os privilégios efetivos no arranque de produção,
incluindo pertença a papéis e propriedade de objetos, e recusa um login
administrativo. Esta verificação está no código desta branch; a troca da
credencial em produção pode usar o código anteriormente publicado, que não
contém ainda esta verificação. Publicá-la requer incluir estas alterações de
código num deploy revisto.

## Migrações e novas tabelas

Usar a ligação **direta** do proprietário em `ADMIN_DATABASE_URL`, fornecida
explicitamente ao processo. A credencial administrativa não deve estar no
ambiente da API. `DATABASE_URL` da API usa a ligação com pool de `church_app`.

```powershell
# As variáveis são injetadas pelo cofre/ambiente, nunca copiadas para o Git.
npm run db:deploy --workspace @church/api
```

O comando aplica as migrações com `ADMIN_DATABASE_URL` e, depois, executa
`runtime-privileges.sql`. Não existe concessão automática de privilégios a
qualquer futura tabela: o passo explícito após migrações reaplica as concessões
e as exclusões da auditoria e das migrações. Uma falha nesse passo faz o comando
falhar; não iniciar a publicação antes de corrigir e repetir a aplicação dos
privilégios.

```powershell
npm run db:security:apply --workspace @church/api
```

Para provisionar um ambiente novo, fornecer também
`RUNTIME_DATABASE_PASSWORD`, gerado aleatoriamente com pelo menos 48 caracteres
base64url, e executar `db:security:provision`. O comando recusa substituir uma
senha existente; rotações precisam de uma passagem coordenada para a nova
credencial. Nenhum destes comandos carrega automaticamente `.env` ou imprime
credenciais. A alteração de privilégios e a criação do login são transacionais.

No Docker Compose, o serviço administrativo `db-init` executa a ação `bootstrap`:
aplica migrations e privilégios e cria `church_app` apenas se não existir.
A senha existente nunca é substituída. A API aguarda esse serviço e recebe
somente a ligação limitada. O comando padrão da imagem da API apenas inicia
o servidor; tarefas administrativas são executadas separadamente.

## Cofre local Windows

`apps/api/scripts/protect-local-secrets.ps1` arquiva as cópias antigas
`.env.neon-before-deploy` e `.env.prod-superuser-credentials.txt` no diretório
`%USERPROFILE%\.codex\secrets\ponte`. Os ficheiros são encriptados por DPAPI,
com acesso limitado ao utilizador Windows atual. A leitura é verificada antes
de remover os originais. O script recusa sobrescrever um segredo arquivado.

`production-connections.xml` contém as ligações administrativas e limitadas
necessárias para recuperar esta configuração. Só a conta Windows que o criou
consegue desencriptá-lo neste computador. É armazenamento local de credenciais,
**não é uma cópia de segurança da base de dados**, nem substitui um gestor de
segredos com recuperação independente do computador.

Após autorização explícita, o `.env` local passou a usar a base vazia
`church_development`, na branch `development` (`br-wild-pine-b2xr2nki`).
`DATABASE_URL` usa o pool; `DATABASE_URL_UNPOOLED` e `ADMIN_DATABASE_URL` usam
a ligação direta desta base de desenvolvimento. `NODE_ENV` é `development`.
O contexto `.neon` também aponta para `development`. `.env.local` foi preservado.

A branch só com estrutura foi recusada pelo Neon devido ao papel legado
`church_runtime`. Como alternativa, foi criada uma base vazia dedicada numa
branch normal. A base herdada `neondb` continua nessa branch, mas a credencial
local `church_dev_owner` não tem CONNECT nem pertença aos seus papéis. Foi
confirmada a rejeição de uma ligação a essa base. Os administradores do projeto
continuam a conseguir aceder à cópia herdada; não é uma branch sem dados pessoais.
A base usada pela aplicação local tem 34 migrações e zero membros/utilizadores;
não foram executados seeds nem importados dados de produção.

O login local é proprietário apenas da base de desenvolvimento, sem
CREATEDB, CREATEROLE, SUPERUSER ou BYPASSRLS. Não existe em produção.
`development-connections.xml` guarda as novas ligações encriptadas;
`local-environment-before-isolation.xml` preserva o `.env` anterior, também
encriptado e verificado. A credencial administrativa de produção continua
no cofre, fora do `.env` ativo. Manter explícita a branch e a credencial de
manutenção em qualquer operação intencional sobre produção.

Não executar um `neon env pull` genérico sobre esta configuração: o CLI pode
escolher a base herdada `neondb` e o proprietário predefinido. Para recuperar
o ambiente local, usar as ligações de `development-connections.xml` e manter
explicitamente a base `church_development` e o papel `church_dev_owner`.

## Recuperação no plano gratuito

O utilizador escolheu manter o plano gratuito. O projeto tem uma janela de
recuperação de 21 600 segundos (6 horas), um snapshot manual existente e não
tem snapshots agendados. Não foi alterado o plano nem ativada faturação.

Foi restaurado o snapshot `before-unified-members-20261015`
(`snap-gentle-recipe-b2vno29h`) para a branch separada
`security-restore-drill-20261016` (`br-mute-feather-b2ovv5mf`), **sem finalizar**
sobre produção. Confirmadas 59 tabelas, 26 migrações concluídas e os dois
triggers de auditoria ativos. O snapshot é anterior às migrações mais recentes:
uma recuperação real exigiria avaliar e reaplicar as migrações necessárias.
A branch do ensaio expira a 17 de outubro às 23:00 UTC.

O ensaio valida a restauração e a leitura do catálogo, não a integridade de
todos os dados, nem uma recuperação completa da aplicação. A produção não foi
substituída. Nunca executar `snapshots finalize` nesta branch de ensaio.

Continuam pendentes cópias regulares independentes, encriptadas, com retenção
definida e ensaios de restauro. A cópia manual existente não cobre alterações
posteriores à sua criação. O plano gratuito não oferece a mesma política de
snapshots agendados e retenção dos planos pagos. Uma alternativa externa deve
usar `pg_dump` por ligação direta, destino encriptado e monitorização das
execuções; não guardar dumps em texto simples no repositório.

## Rede e conta administrativa

Ligações públicas continuam autenticadas e encriptadas. IP Allow exige Neon
Scale; proteção de branches também está sujeita a plano pago. Uma futura
restrição de rede precisa primeiro de uma origem de saída estável para a
Vercel, dos acessos de manutenção e do plano compatível. Não bloquear ligações
públicas sem esse caminho alternativo, pois interromperia a API.

O acesso administrativo Neon e a credencial do proprietário ainda existem para
migrações e recuperação. Não foi revogada a credencial do proprietário durante
a troca, para preservar o deploy anterior como recuperação operacional. A sua
rotação deve considerar deploys antigos, integrações e ferramentas de manutenção.
Confirmar MFA na conta Neon/Vercel no painel; esta inspeção não confirmou MFA.

## Validação

- Produção usa `church_app`: deploy `dpl_AqMNprr11bkqRPuWHQS5N8c2zoSC`
  reconstruído a partir do deploy anteriormente publicado
  `dpl_6FKpvKNV7KkBMtZFMDyrZA8reTcT`, testado antes da promoção e promovido
  para `https://ponte-umber.vercel.app`. Nenhuma alteração pendente do diretório
  foi incluída nessa reconstrução. A ligação observada no PostgreSQL usa
  `church_app`; verificados também os privilégios diretamente sob esse login.
- Branch Git: `codex/database-security`; alterações anteriores preservadas.
- Branch de testes: `security-hardening-20261016` (`br-lively-water-b2ghpaub`),
  expira a 19 de outubro às 23:00 UTC. Dados sintéticos de registo ficam apenas
  nesta branch até expirar.
- 13 testes com PostgreSQL real: arranque com login limitado, rejeição do
  proprietário, bloqueio de operações privilegiadas, registo, login, leitura
  da sessão, permissões e saúde da API. Reaplicação de privilégios também passou.
- 21 testes existentes de segurança da autenticação e passkeys passaram.
- TypeScript e ESLint dos ficheiros alterados passaram.
- O comando de migração com reaplicação de privilégios foi executado com sucesso
  na branch de testes.
- Smoke checks de produção: 3 pedidos e 6 asserções Postman aprovados, execução
  local sem publicação de resultados na cloud Postman. Nenhum erro de execução
  nos logs do novo deploy consultados nos 15 minutos da verificação.

Smoke checks públicos reutilizáveis, sem credenciais nem escrita de dados:

```powershell
postman collection run docs/database-security.postman_collection.json --no-report-events
```

Para deploys protegidos, usar `vercel curl` com a autenticação Vercel existente;
uma página de login Vercel não valida a API. Não desativar a proteção do deploy.

O teste de integração exige `DB_SECURITY_TEST_ADMIN_URL`,
`DB_SECURITY_TEST_RUNTIME_URL`, `DB_SECURITY_TEST_HOST` e
`DB_SECURITY_PRODUCTION_HOST` explícitos. As duas ligações devem apontar para o
host de teste, diferente do host de produção. Executar a partir de `apps/api`:

```powershell
node ../../node_modules/jest/bin/jest.js --runInBand --runTestsByPath test/database-runtime.e2e-spec.ts
```

Sem nenhuma destas variáveis, a suíte é ignorada na execução normal dos testes.
Se alguma for fornecida, a validação exige a configuração completa e recusa o
host de produção.

### Revisão de 20 de outubro de 2026

- Build completo e lint da API, frontend e scripts alterados aprovados.
- 26 testes de autenticação/passkeys e 40 testes de interface aprovados.
- 13 testes de segurança executados novamente num PostgreSQL 17 descartável
  local, com dados sintéticos. O provisionamento e a reaplicação dos privilégios
  passaram. O contentor foi removido após a execução; produção não foi alterada.
- As migrations SQL foram aplicadas por `psql` neste ensaio. O Prisma CLI no
  Windows falhou ao ligar ao PostgreSQL no WSL, pelo que o comando completo
  `db:deploy` não foi revalidado neste ensaio; não confundir esta limitação com
  uma validação aprovada desse comando.
- O lint global continua a incluir erros anteriores em
  `apps/api/prisma/bootstrap-production.cjs` e scripts locais de `tmp/`.
  O lint das áreas e scripts deste PR passou.

Fontes: [privilégios PostgreSQL](https://www.postgresql.org/docs/current/ddl-priv.html),
[limites Neon Free](https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md),
[IP Allow](https://github.com/neondatabase/website/blob/main/content/docs/introduction/ip-allow.md).
