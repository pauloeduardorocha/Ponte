# Vercel + Neon deployment

## Compatibilidade do runtime NestJS

Os pacotes `@nestjs/common`, `@nestjs/core` e `@nestjs/platform-express` devem
usar a mesma versão major. O adaptador Express permanece na linha 11 enquanto
o núcleo estiver na 11. Um build bem-sucedido não comprova que a função inicia:
antes de promover um deploy, confirme `/api/v1/health` na URL da implantação.
O override de `multer` em `2.5.0` preserva a correção de segurança do parser
multipart sem exigir uma migração do framework para Nest 12.
A versão 12 do adaptador isolada resultou em `Cannot find module
'@nestjs/platform-express'` no runtime da Vercel, apesar do build aprovado.

For current database credentials, migrations and recovery procedures, see
[database security](database-security.md). The API must use the restricted
`church_app` login; keep the migration owner outside its runtime environment.

Deploy the React frontend and NestJS backend as two Vercel projects, and use
Neon Free for PostgreSQL. Vercel Hobby is for personal, non-commercial use only.
Keep all services on free plans; do not enable paid upgrades or add-ons.

## Database

Create a Neon Free project in Frankfurt (near the API's `fra1` region).
Use its pooled PostgreSQL connection string for the API's `DATABASE_URL`, with
SSL enabled and `connection_limit=2&pool_timeout=20` appended to its query string.
Use the direct connection string for migrations. Store credentials in provider
environment settings, never in Git or chat.

Run migrations once against the new database before publishing the API:

```powershell
# Supply the owner's direct connection securely as ADMIN_DATABASE_URL.
npm run db:deploy --workspace @church/api
# Bootstrap is an administrative operation in this shell only.
$env:DATABASE_URL = $env:ADMIN_DATABASE_URL
$env:NODE_ENV = 'production'
npm run build --workspace @church/shared
npm run db:bootstrap:production
```

Do not run the development demo seed against production. This creates a new,
empty database; it does not transfer local data or local attachments.

## API project

Import the repository into Vercel, name the project `ponte-api` (or choose an
available name), set Root Directory to `apps/api`, and enable access to files
outside the root directory. The checked-in `vercel.json` configures NestJS,
workspace installation, Prisma client generation, builds, and Frankfurt hosting.
Use Node.js 22.x.

The e-Fatura scraper is part of the API. Production dependencies include
`puppeteer-core` and a matching `@sparticuz/chromium` binary for Linux.
`apps/api/vercel.json` includes its worker modules and Chromium assets and
sets the function duration to 180 seconds (the consultation times out at
120 seconds). No separate scraper installation is required. See
[e-Fatura configuration](EFATURA.md) for local Chrome configuration and portal filters.

Set these environment variables for Production:

| Variable                 | Value                                                      |
| ------------------------ | ---------------------------------------------------------- |
| `NODE_ENV`               | `production`                                               |
| `DATABASE_URL`           | Neon pooled connection string for restricted `church_app`  |
| `JWT_ACCESS_SECRET`      | Random secret, at least 32 characters                      |
| `JWT_REFRESH_SECRET`     | Different random secret, at least 32 characters            |
| `CORS_ORIGIN`            | Exact frontend origin, e.g. `https://ponte-web.vercel.app` |
| `PRIVATE_STORAGE_DRIVER` | `database`                                                 |
| `SEED_DEMO`              | `false`                                                    |

For password recovery emails, also configure `BIRD_API_KEY` (private EU key),
`BIRD_EMAIL_FROM=noreply@igrejaponte.com` and `PUBLIC_WEB_URL` with the actual
HTTPS frontend URL. See [Bird email setup](email.md). Redeploy the API after
changing these values.

Generate the two secrets independently with `node -e
"console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`
in a private terminal. Do not place secrets in frontend environment variables.

## Frontend project

Import the same repository again, name it `ponte-web`, set Root Directory to
`apps/web`, enable access to files outside the root directory, and use Node.js
22.x. The configuration builds shared types and the Vite frontend.

Replace `https://ponte-api.vercel.app` in `apps/web/vercel.json` with the actual
API production hostname before deploying. `/api/*` is proxied to the backend;
other frontend routes fall back to `index.html`. This keeps HttpOnly refresh
cookies same-origin without weakening cookie settings. No browser API URL or
database credentials are needed.

Set the API's `CORS_ORIGIN` to the actual frontend production origin and redeploy
the API if the project name differs. Use separate databases and environment
variables for previews; do not attach preview deployments to production data.
Preview login requires explicitly adding that preview origin to `CORS_ORIGIN`.

For the current `ponte` project, the production `CORS_ORIGIN` is a comma-separated
list with no trailing slashes:

```text
https://ponte-umber.vercel.app,https://igrejaponte.com,https://www.igrejaponte.com
```

This list controls CORS, authentication origin checks and passkey validation.
After changing it in Vercel, redeploy the existing production deployment to
activate the new value. Keep development and preview settings separate.
Passkeys registered on the old hostname must be registered again on the new
hostname; use the password to sign in first.

## Verification and initial access

Visit `/api/v1/health` through the frontend and directly on the API. Both should
respond successfully. Open a frontend deep link, register an account, log in,
reload to check refresh, and log out. Provision production roles and grant the
first administrator through a trusted database operator; public registration
only creates MEMBER users. After registering and verifying your own account,
set `BOOTSTRAP_ADMIN_EMAIL` to that account's email in your private operator shell
and rerun `npm run db:bootstrap:production` to grant SUPER_ADMIN. This command
preserves existing role grants and users and never creates demo passwords.
The development demo seed is intentionally blocked.

Financial attachments use private PostgreSQL `BYTEA` records in this deployment,
and remain accessible only through existing authorized API routes. They count
toward Neon's storage allowance. Existing filesystem attachments are not copied.
Vercel Functions have a 4.5 MB request/response limit, so uploads and generated
downloads must remain below that limit (including multipart overhead), even
though the app's local upload limit is 10 MB. Large imports/reports may need a
different host or an object storage upload/download flow.

Neon and Vercel can pause service when free allowances are exhausted. Check
provider dashboards for current limits. No production migration or demo seed
runs automatically during a build or function startup.

References: https://vercel.com/docs/frameworks/backend/nestjs,
https://vercel.com/docs/plans/hobby,
https://vercel.com/docs/functions/limitations,
https://neon.com/pricing.

## Expense-only invoice associations

Deploy the version that removes invoice-to-bank association routes before applying
`20261015010000_invoice_expense_only`. Older API versions still query the removed
column and must not serve traffic after this migration.

The migration transfers each existing bank invoice link to the single expense
with that bank transaction, preserves existing direct expense links, and removes
the invoice bank-transaction column. It stops without changing data if a bank
link has no matching expense or multiple matching expenses. Resolve those cases
before retrying; do not discard invoice links.
