# Account appearance

In **Minha conta → Aparência → Modo de cores**, select **Seguir o dispositivo**, **Claro**, or **Escuro**.
Device-following (`system`) is the default for new accounts and missing preferences.
It follows `prefers-color-scheme: dark`, including changes while the app is open.
Explicit saved light/dark choices are preserved.
Changes apply after saving succeeds. A failed save keeps the previous mode and
shows an error so the user can retry. Signing out returns the app to the device theme.

`PATCH /api/v1/auth/preferences` requires authentication and accepts `colorMode` set to `system`, `light`, or `dark`. It returns the saved
`{ "colorMode": "…" }`, with `Cache-Control: no-store`. Invalid values or extra
properties return 400; unauthenticated requests return 401. The account ID is
taken from the authenticated session. All authenticated accounts can change
their own preference, without an administrative permission.

The preference is stored on `users.color_mode` and returned by `/auth/me`, login,
refresh, and passkey login. It is restored on the next login/session restoration
on every device. Already-open sessions on other devices pick it up on reload.

Before deploying the system-mode update, apply the checked-in Prisma migration
`20261022110000_system_color_mode` using the existing database deployment workflow
(`npm run db:deploy --workspace=@church/api`). It widens the existing column to six characters, changes its default to `system`,
and extends the constraint to accept all three choices. Existing saved preferences
are preserved. The earlier `20261022100000_user_color_mode` migration is unchanged.

Verification: account appearance tests cover defaults, saving both modes,
restoration, failed-save retry, and sign-out. Authentication HTTP tests cover
accepted values, validation, authentication, and the authenticated account ID.
Desktop (1440 px) and mobile (390 px) browser previews used a simulated account;
both modes rendered without browser errors or horizontal overflow. The schema
validated locally.

Released to production on 22 October 2026 as Vercel deployment
`dpl_3x1yPTUAwoCVCDUunr951sTqAX9u`. Migration
`20261022100000_user_color_mode` was tested on an expiring branch of production
and applied to the `production` branch of Neon project `proud-dream-93315359`.
All 19 existing accounts received the light default. The branch test confirmed
both valid values, rejection of invalid values, and runtime privileges.

Direct Prisma connectivity from the local Windows process failed during TLS
setup. The checked-in SQL and runtime privilege script were therefore applied
through Neon's transaction connector, together with the Prisma migration-history
record and SHA-256 checksum
`6d6a1c11d08cf1d71be7fd2093f0208b6a71e56764a836736dbf74c1be6a318d`.
No application account preference was changed manually in production.

Production checks confirmed healthy API/database responses on `igrejaponte.com`,
`www.igrejaponte.com`, and `ponte-umber.vercel.app`, the published account-page
appearance controls, and 401 for unauthenticated preference changes. The existing
Postman security smoke collection passed all six assertions. Saving while signed
in was covered by local integration tests, not exercised with a production user.

The device-following update was released on 22 October 2026 as deployment
`dpl_4Z9Z5AoDFGnp62WqftJ8Ak7Lacbr`, following migration
`20261022110000_system_color_mode` (SHA-256
`b6a393e6fa0ed64aec3dc993e1060313ca58667d89c136f9ae6e0cbd2c6c8723`).
The migration was tested on the same expiring production branch, then applied
transactionally through Neon with the Prisma history record and runtime grants.
It preserves existing light/dark choices. Five appearance tests, 23 authentication
frontend tests, eight preference API tests, lint, TypeScript and the frontend build
passed. A mobile browser preview with a simulated account confirmed live device
changes, explicit overrides, saving `system`, no horizontal overflow and no
browser errors. Staged and public API/database health checks passed; the public
account-page asset contains the device option, and unauthenticated preference
changes return 401. Authenticated production preferences were not modified.
