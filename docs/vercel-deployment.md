# Publicação na Vercel

## Configuração principal: um projeto com serviços

O `vercel.json` da raiz define `api` (NestJS, `apps/api`) e `web` (Vite, `apps/web`) no mesmo projeto. `/api/(.*)` vai para o serviço API; as demais rotas vão para o frontend, com fallback SPA. Esta é a referência para publicar a configuração principal do repositório.

Selecione a raiz do monorepo no projeto Vercel. Confira os serviços detectados e use um Node compatível com `package.json`; desenvolvimento e CI seguem `.node-version`. Os comandos de build compilam o shared, geram Prisma para a API e constroem os respectivos workspaces. Build e inicialização não executam migrations.

A região `fra1` declarada em `apps/api/vercel.json` pertence à configuração alternativa de projeto separado. Ela não comprova a região efetiva de um deploy com serviços da raiz; confira os metadados da implantação.

## Preparação do banco

Use banco isolado para previews e testes. A API exige `DATABASE_URL` com TLS e login limitado; use conexão pooled quando apropriado à hospedagem. A conexão direta do proprietário fica em `ADMIN_DATABASE_URL`, somente no processo administrativo.

1. Confirmar destino, backup recuperável e compatibilidade da versão com as migrations.
2. Injetar `ADMIN_DATABASE_URL` no ambiente privado do processo e executar `npm run db:deploy --workspace @church/api`.
3. Em banco novo, provisionar também o login limitado conforme [segurança do banco](database-security.md).
4. Só iniciar a API após aplicar migrations e privilégios. Não executar seed demo em produção.

O bootstrap de roles (`npm run db:bootstrap:production`) é uma operação administrativa separada: exige `NODE_ENV=production` e `DATABASE_URL` do proprietário no processo privado, além do shared compilado. Não cria usuários nem senhas. Para conceder `SUPER_ADMIN`, `BOOTSTRAP_ADMIN_EMAIL` deve identificar uma conta já `ACTIVE` e não excluída. O cadastro público cria `PENDING_APPROVAL`; num banco sem aprovador, o operador precisa verificar e ativar explicitamente a primeira identidade pelo canal administrativo antes do bootstrap. Não há aprovação pública automática.

## Variáveis da API

| Variável                                                          | Uso                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `NODE_ENV`                                                        | `production`                                                              |
| `DATABASE_URL`                                                    | Conexão do login restrito, nunca proprietário                             |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                         | Segredos fortes e distintos, pelo menos 32 caracteres                     |
| `CORS_ORIGIN`                                                     | Origens HTTPS exatas do frontend, separadas por vírgula e sem barra final |
| `PRIVATE_STORAGE_DRIVER`                                          | `database`, obrigatório no runtime Vercel                                 |
| `PUBLIC_WEB_URL`                                                  | Origem pública HTTPS usada em recuperação e checkout                      |
| `BIRD_API_KEY`, `BIRD_EMAIL_FROM`                                 | [E-mail](email.md)                                                        |
| `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` | [Push](notifications.md)                                                  |
| `NOTIFICATION_OUTBOX_SECRET`                                      | Mesmo segredo dedicado no worker e GitHub Actions                         |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                      | [Inscrições pagas](inscricoes-publicas-stripe.md)                         |
| `YOUTUBE_API_KEY`                                                 | Consulta de vídeos e playlists no servidor                                |
| `TRANSLATION_APP_DOWNLOAD_URL`                                    | ZIP Windows hospedado separadamente, HTTPS                                |

Mantenha `SEED_DEMO` desativado. Chaves privadas não usam prefixo `VITE_`, não entram no Git e não devem ser exibidas em logs. Alterações de variáveis exigem novo deploy. O Compose não encaminha todas as integrações opcionais; confira `docker-compose.yml` ao reproduzi-las localmente.

O scraper e-Fatura está no build da API em `dist/efatura-runtime`. A configuração permite 180 segundos por função; a consulta tem prazo interno de 120 segundos. Ver [e-Fatura](EFATURA.md). Preserve a mesma versão major entre os pacotes NestJS de núcleo e adaptador Express.

## Domínio, cookies e previews

Use a mesma origem do frontend para `/api` e HTTPS para cookies Secure. `CORS_ORIGIN` controla CORS, verificações de origem da autenticação e passkeys. Previews precisam de banco, segredos e origens próprios; não conecte previews a dados de produção. Passkeys são vinculadas ao hostname: criar no domínio final evita recadastro na mudança de domínio.

## Alternativa: projetos separados

Os `vercel.json` de `apps/api` e `apps/web` permitem configurar dois projetos, com acesso aos arquivos externos ao workspace. Nesta alternativa, ajuste o proxy `/api/:path*` de `apps/web/vercel.json` para o hostname real da API e configure `CORS_ORIGIN` para o frontend. Não aplique esse roteiro por engano a um projeto que já usa os serviços da raiz.

## Verificação de publicação

Antes do push, siga as verificações e a sincronização Git de [AGENTS.md](../AGENTS.md). Após o deploy, confirme:

- Commit e estado da implantação nos metadados da Vercel; push não comprova deploy.
- `/api/v1/health` pela origem pública e carregamento de rotas profundas do frontend.
- Login autorizado, restauração por refresh, logout e permissões na API.
- Versão em `/app-version.json`, rodapé e relatórios de erros, preservando a versão de clientes PWA antigos.
- Documentos privados, jobs e integrações configuradas, pelos roteiros específicos.

O armazenamento `database` inclui anexos no PostgreSQL. Arquivos locais não são migrados automaticamente. Limites do alojamento podem ser menores que os validadores locais; uploads em blocos de [reembolsos](reimbursement-resumable-uploads.md) e [escalas](ministry-schedules.md) atendem fluxos específicos, não todos os imports e relatórios. Consulte limites e planos vigentes nos provedores antes de ampliar uso.

## Compatibilidade de migrations antigas

`20261015010000_invoice_expense_only` remove a associação direta entre fatura e movimento bancário, migrando-a para a despesa correspondente. Não sirva API antiga que ainda consulte a coluna removida após essa migration. Ela aborta se um vínculo bancário não tiver exatamente uma despesa correspondente; resolva a inconsistência sem descartar vínculos. O contrato atual está em [e-Fatura](EFATURA.md).
