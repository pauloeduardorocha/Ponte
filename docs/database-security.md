# Segurança da base de dados

## Credenciais e privilégios

A API de produção usa `DATABASE_URL` do login limitado `church_app`, membro de `church_runtime` (NOLOGIN). O proprietário usa conexão direta em `ADMIN_DATABASE_URL`, somente nos processos de manutenção. A credencial administrativa fica fora do runtime.

`apps/api/prisma/runtime-privileges.sql` define os grants. O runtime não pode administrar papéis, possuir objetos da aplicação, criar objetos no schema público ou acessar `_prisma_migrations`. Na auditoria, pode consultar/inserir, mas não atualizar, excluir ou truncar. `PrismaService` valida os privilégios efetivos ao iniciar em produção e recusa credenciais administrativas.

Esse login acessa dados de todos os módulos; a autorização por pessoa continua nos guards e serviços da API. Ele não implementa isolamento entre igrejas.

## Migrations e provisionamento

Injete as variáveis no processo por um ambiente privado. Estes scripts **não carregam `.env` automaticamente** e não imprimem credenciais.

```sh
npm run db:deploy --workspace @church/api
npm run db:security:apply --workspace @church/api
```

`db:deploy` aplica migrations com `ADMIN_DATABASE_URL` e reaplica privilégios. O segundo comando permite reaplicar apenas grants. Se esse passo falhar, corrija e repita antes de iniciar a API. Não use `migrate dev`, `db push` ou reset em produção.

Para banco novo, forneça também `RUNTIME_DATABASE_PASSWORD`, aleatório com pelo menos 48 caracteres base64url:

```sh
npm run db:security:provision --workspace @church/api
```

O provisionamento recusa substituir senha existente. Rotação exige coordenação entre banco, runtime e processos dependentes. No Compose, `db-init` executa `bootstrap`: migrations, grants e criação do login se ausente. A API recebe apenas a conexão limitada e aguarda esse serviço.

## Desenvolvimento e segredos locais

Confirme host, banco, branch e papel antes de manutenção. `.env`, contexto `.neon` e nomes de arquivos não comprovam o destino. A configuração local efetiva não é auditada por este documento.

`apps/api/scripts/protect-local-secrets.ps1` atende ao arquivamento legado com DPAPI. Os arquivos dependem do usuário Windows e do computador que os criou; não substituem gestor de segredos recuperável em outra máquina. Não versione credenciais, dumps ou arquivos de ambiente.

## Backup, rede e recuperação

Siga [backup e recuperação](backup-recovery.md). Os workflows estão versionados; secrets, habilitação, última execução e RPO/RTO reais precisam ser confirmados no ambiente. Ensaio de banco não demonstra recuperação completa da aplicação.

Use TLS nas conexões públicas e MFA nas contas administrativas. Restrições de rede dependem dos recursos contratados e de uma saída conhecida da hospedagem; confira os provedores antes de mudar o acesso. Rotação do proprietário precisa considerar ferramentas administrativas e deploys antigos.

## Verificação reproduzível

```sh
npm run test:integration -- --security-only
```

O runner cria PostgreSQL descartável, aplica migrations, provisiona o runtime e executa `apps/api/test/database-runtime.e2e-spec.ts`. Ver [CI](ci.md). A execução direta dessa suíte exige `DB_SECURITY_TEST_ADMIN_URL`, `DB_SECURITY_TEST_RUNTIME_URL`, `DB_SECURITY_TEST_HOST` e `DB_SECURITY_PRODUCTION_HOST`, com destino de teste distinto de produção. Sem configuração, a suíte direta pode ser ignorada; prefira o runner.

Para smoke checks somente de leitura contra API local já iniciada:

```sh
postman collection run docs/database-security.postman_collection.json --env-var baseUrl=http://localhost:3000 --no-report-events
```

A coleção possui destino público padrão; especifique `baseUrl` para escolher o ambiente. Health e respostas 401 não validam fluxos autenticados. Em deploy protegido, preserve a proteção e use acesso autenticado.
