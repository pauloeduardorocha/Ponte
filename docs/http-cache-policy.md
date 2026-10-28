# Cache HTTP e persistência no cliente

Todas as 127 rotas GET do contrato estão classificadas explicitamente em packages/shared/src/http-cache-policy.ts. São 71 rotas elegíveis: 1 de aniversários (24 h), 30 financeiras/reembolsos (1 h) e 40 de cadastros/conteúdo (6 h). As outras 56 exigem dados atuais ou não admitem persistência. Rotas novas e métodos de escrita recebem no-store por padrão.

Respostas GET JSON bem-sucedidas elegíveis usam Cache-Control: private, max-age=<segundos>, Vary: Authorization, Cookie. CDN-Cache-Control e Vercel-CDN-Cache-Control são no-store: dados privados não podem ser compartilhados na CDN. Falhas, autenticação, exportações e estado operacional crítico não são persistidos. O catálogo filtrado por available também exige rede.

O transporte do frontend usa CacheStorage, persistente entre recargas e disponível no PWA, seguindo o TTL da resposta e o limite da rota. A identidade só é liberada após autenticação online e inclui as permissões atuais. Tokens não são persistidos. Sair/expirar a sessão apaga o cache; trocar de conta ou permissões remove o anterior. O service worker mantém apenas o app shell, evitando um segundo cache privado independente. O transporte desativa o cache HTTP implícito para permitir invalidação determinística.

Qualquer escrita de negócio invalida conservadoramente todas as respostas persistidas antes e depois da tentativa (inclusive resultado de escrita incerto), bloqueando persistência enquanto a escrita estiver em curso. Atualizar manualmente também invalida antes de consultar. Leituras iniciadas antes de uma invalidação não podem repopular o cache. Não há fallback para respostas expiradas nem fila de escritas offline. O cache tem limite de 200 respostas por identidade. Invalidações e logout são propagados entre abas por BroadcastChannel quando disponível. CacheStorage indisponível não impede o uso da aplicação. Mudanças feitas por outros dispositivos aparecem após o TTL ou atualização manual; autorização e disponibilidade nas escritas continuam verificadas pelo servidor.

| GET (prefixo /api/v1) | Política |
| --- | --- |
| `/audit` | no-store |
| `/audit/frontend-errors` | no-store |
| `/audit/frontend-errors/map` | no-store |
| `/audit/frontend-errors/stats` | no-store |
| `/audit/frontend-errors/{id}` | no-store |
| `/audit/{id}` | no-store |
| `/auth/me` | no-store |
| `/auth/passkeys` | no-store |
| `/community/birthdays` | private, max-age=86400 (24 h) |
| `/community/dashboard` | private, max-age=21600 (6 h) |
| `/community/events` | private, max-age=21600 (6 h) |
| `/community/visitors` | private, max-age=21600 (6 h) |
| `/events` | private, max-age=21600 (6 h) |
| `/events/{id}` | private, max-age=21600 (6 h) |
| `/events/{id}/attendees` | no-store |
| `/events/{id}/coupons` | private, max-age=21600 (6 h) |
| `/events/{id}/managers` | private, max-age=21600 (6 h) |
| `/events/{id}/payments` | no-store |
| `/events/{id}/refunds` | no-store |
| `/events/{id}/registration-lots` | no-store |
| `/events/{id}/registrations` | no-store |
| `/events/{id}/reports` | no-store |
| `/events/{id}/reports/export` | no-store |
| `/events/{id}/sessions` | private, max-age=21600 (6 h) |
| `/events/{id}/sessions/{sessionId}/attendance` | no-store |
| `/events/{id}/tickets` | no-store |
| `/finance/accounts` | private, max-age=3600 (1 h) |
| `/finance/attachments/{id}/download` | no-store |
| `/finance/banking/import-guidance` | private, max-age=3600 (1 h) |
| `/finance/banking/imports` | private, max-age=3600 (1 h) |
| `/finance/banking/imports/{id}` | private, max-age=3600 (1 h) |
| `/finance/banking/imports/{id}/download` | no-store |
| `/finance/banking/members` | private, max-age=3600 (1 h) |
| `/finance/banking/pending-classification` | private, max-age=3600 (1 h) |
| `/finance/banking/transactions` | private, max-age=3600 (1 h) |
| `/finance/banking/transactions/{id}/attachments` | private, max-age=3600 (1 h) |
| `/finance/banking/transactions/{id}/attachments/{attachmentId}/download` | no-store |
| `/finance/banking/transactions/{id}/suggestions` | private, max-age=3600 (1 h) |
| `/finance/categories` | private, max-age=3600 (1 h) |
| `/finance/contributions` | private, max-age=3600 (1 h) |
| `/finance/cost-centers` | private, max-age=3600 (1 h) |
| `/finance/dashboard` | private, max-age=3600 (1 h) |
| `/finance/expenses` | private, max-age=3600 (1 h) |
| `/finance/expenses/{id}/attachments` | private, max-age=3600 (1 h) |
| `/finance/incomes` | private, max-age=3600 (1 h) |
| `/finance/invoices` | private, max-age=3600 (1 h) |
| `/finance/invoices/expense-suggestions/{expenseId}` | private, max-age=3600 (1 h) |
| `/finance/invoices/imports/{id}/download` | no-store |
| `/finance/members` | private, max-age=3600 (1 h) |
| `/finance/reports` | private, max-age=3600 (1 h) |
| `/finance/reports/export` | no-store |
| `/finance/reports/lookups` | private, max-age=3600 (1 h) |
| `/finance/suppliers` | private, max-age=3600 (1 h) |
| `/health` | no-store |
| `/library/book-options/authors` | private, max-age=21600 (6 h) |
| `/library/book-options/categories` | private, max-age=21600 (6 h) |
| `/library/book-options/keywords` | private, max-age=21600 (6 h) |
| `/library/books` | private, max-age=21600 (6 h) |
| `/library/books/availability` | no-store |
| `/library/books/{id}` | private, max-age=21600 (6 h) |
| `/library/books/{id}/history` | no-store |
| `/library/categories` | private, max-age=21600 (6 h) |
| `/library/copies` | no-store |
| `/library/copies/{id}/history` | no-store |
| `/library/dashboard` | no-store |
| `/library/fines` | no-store |
| `/library/fines/{id}/history` | no-store |
| `/library/loans` | no-store |
| `/library/members` | private, max-age=21600 (6 h) |
| `/library/members/{id}/history` | no-store |
| `/library/reservations` | no-store |
| `/library/settings` | private, max-age=21600 (6 h) |
| `/member-portal/dashboard` | no-store |
| `/member-portal/events` | private, max-age=21600 (6 h) |
| `/member-portal/ministries` | private, max-age=21600 (6 h) |
| `/member-portal/small-groups` | private, max-age=21600 (6 h) |
| `/member-portal/small-groups/{id}` | private, max-age=21600 (6 h) |
| `/members` | private, max-age=21600 (6 h) |
| `/members/{id}` | private, max-age=21600 (6 h) |
| `/operations/assignees` | private, max-age=21600 (6 h) |
| `/operations/dashboard` | private, max-age=21600 (6 h) |
| `/operations/events` | private, max-age=21600 (6 h) |
| `/operations/events/{id}/registrations` | no-store |
| `/operations/follow-ups` | private, max-age=21600 (6 h) |
| `/operations/follow-ups/{id}/interactions` | private, max-age=21600 (6 h) |
| `/operations/identity` | no-store |
| `/operations/inbox` | no-store |
| `/operations/inbox/unread` | no-store |
| `/operations/ministries` | private, max-age=21600 (6 h) |
| `/operations/ministries/{id}/participants` | private, max-age=21600 (6 h) |
| `/operations/notification-audiences/{kind}` | no-store |
| `/operations/notification-templates` | private, max-age=21600 (6 h) |
| `/operations/notifications` | no-store |
| `/operations/people` | private, max-age=21600 (6 h) |
| `/operations/push/config` | private, max-age=21600 (6 h) |
| `/operations/schedules` | private, max-age=21600 (6 h) |
| `/operations/schedules/{id}/assignments` | private, max-age=21600 (6 h) |
| `/operations/schedules/{id}/attachments` | private, max-age=21600 (6 h) |
| `/operations/schedules/{id}/attachments/{attachmentId}` | no-store |
| `/operations/small-groups` | private, max-age=21600 (6 h) |
| `/operations/small-groups/{id}/participants` | private, max-age=21600 (6 h) |
| `/operations/visitors` | private, max-age=21600 (6 h) |
| `/operations/visitors/{id}/history` | no-store |
| `/privacy/me` | no-store |
| `/privacy/me/export` | no-store |
| `/privacy/me/requests` | no-store |
| `/privacy/members/{id}/export` | no-store |
| `/privacy/requests` | no-store |
| `/privacy/retention` | no-store |
| `/public/events/{id}` | no-store |
| `/public/events/{id}/payment-status` | no-store |
| `/public/events/{id}/profile` | no-store |
| `/reimbursements` | private, max-age=3600 (1 h) |
| `/reimbursements/categories` | private, max-age=3600 (1 h) |
| `/reimbursements/mine` | private, max-age=3600 (1 h) |
| `/reimbursements/movement/{id}` | private, max-age=3600 (1 h) |
| `/reimbursements/movement/{id}/suggestions` | private, max-age=3600 (1 h) |
| `/reimbursements/profile` | private, max-age=3600 (1 h) |
| `/reimbursements/{id}` | private, max-age=3600 (1 h) |
| `/reimbursements/{id}/attachments/{fileId}/download` | no-store |
| `/reimbursements/{id}/suggestions` | private, max-age=3600 (1 h) |
| `/users` | no-store |
| `/users/pending-approvals` | no-store |
| `/users/roles` | no-store |
| `/users/{id}/roles` | no-store |
| `/videos` | private, max-age=21600 (6 h) |
| `/videos/playlists/{playlistId}` | private, max-age=21600 (6 h) |
