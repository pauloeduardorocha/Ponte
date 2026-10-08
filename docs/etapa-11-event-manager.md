# Etapa 11 — Gestor de Eventos

`EVENT_MANAGER` apresenta-se como **Gestor de Eventos**, com a descrição “Responsável pela gestão operacional dos eventos aos quais foi atribuído.” O identificador continua separado do nome de apresentação.

## Schema e implantação

Migration: `apps/api/prisma/migrations/20261008050000_event_manager/migration.sql`.

- `Role.displayName`: nome de apresentação opcional, preservando identificadores existentes.
- `EventManagerAssignment`: evento, utilizador, autor da atribuição, criação e revogação; unicidade por evento/utilizador; índice para consultas de atribuições ativas.
- `CommunityEvent.publishedAt`: publicação auditável.
- `EventRegistration`: token QR único, entrada e estado `APPROVED`; inscrições aprovadas continuam a contar para capacidade e duplicações.
- `EventTicket`: ingresso/lote com preço, quantidade e período de venda.
- `EventCoupon`: desconto percentual; 100% identifica cortesia.
- `EventPayment`: montantes e estado exclusivamente do evento, separado do financeiro geral. A base rejeita pagamentos ligados a inscrições de outro evento.
- `EventRefund`: solicitante, aprovador, motivo, estado e resultado.
- `EventSession` e `EventSessionCheckin`: sessões, entradas e reversões.

A migration faz backfill dos tokens QR e das atribuições dos criadores existentes. O bloco RBAC usa upsert e `ON CONFLICT DO NOTHING`, preservando roles e vínculos existentes. O seed de desenvolvimento também cria a role e associa exatamente as permissões previstas, sem duplicações. Não altera palavras-passe ou atribuições de utilizadores existentes.

Aplicar as migrations antes de iniciar a API com o novo Prisma Client:

```powershell
npm run db:generate
npm run db:deploy --workspace @church/api
```

A validação desta etapa aplica todas as migrations em schemas PostgreSQL temporários. A base da aplicação não é migrada pelos testes.

A migration desta etapa também foi aplicada separadamente à base local de desenvolvimento.

## RBAC e políticas

O guard global de autenticação carrega permissões atuais da base em cada pedido. O `PermissionGuard` e os decorators existentes continuam responsáveis pelo RBAC; `PermissionAny` acrescenta alternativas explícitas para manter compatibilidade com `EVENT_MANAGE` nas rotas antigas.

O `OperationsService.eventScope` aplica atribuições ativas aos utilizadores com permissões granulares. Revogar o criador remove também o acesso que surgiu da criação. `OPERATION_SCOPE_ALL` ou a permissão global legada `EVENT_WRITE` permitem escopo global explícito. A política legada dos líderes com `EVENT_MANAGE` mantém os vínculos a grupos, ministérios e eventos criados.

A role recebe apenas:

```text
EVENT_READ, EVENT_CREATE, EVENT_UPDATE, EVENT_PUBLISH,
EVENT_REGISTRATION_READ, EVENT_REGISTRATION_MANAGE, EVENT_REGISTRATION_APPROVE,
EVENT_ATTENDEE_READ, EVENT_ATTENDEE_MANAGE,
EVENT_TICKET_MANAGE, EVENT_COUPON_MANAGE, EVENT_PAYMENT_READ,
EVENT_CHECKIN, EVENT_CHECKIN_REVERSE, EVENT_NOTIFICATION_SEND,
EVENT_REPORT_READ, EVENT_REPORT_EXPORT
```

`EVENT_MANAGER_ASSIGN` exige também `OPERATION_SCOPE_ALL` nas rotas de atribuição. `EVENT_REFUND_APPROVE` é adicional e não pertence à role. Nenhuma permissão de financeiro geral, utilizadores ou roles é concedida. Administradores recebem as novas permissões; os líderes conservam as permissões operacionais anteriores.

As mutações bloqueiam o evento e verificam novamente a atribuição dentro da transação, usando o mesmo bloqueio das revogações. Recursos aninhados são resolvidos com o seu evento no backend: inscrição, ingresso, pagamento, reembolso, QR e sessão. Listas, dashboards, pesquisas e exportações usam a política comum, incluindo os caminhos antigos `/community` e `/operations`.

## Endpoints

Prefixo: `/api/v1/events`. Todos os IDs são UUID e todos os pedidos exigem autenticação.

| Caminho                                      | Métodos    | Operação                                               |
| -------------------------------------------- | ---------- | ------------------------------------------------------ |
| `/`                                          | GET, POST  | Eventos autorizados; criação com atribuição automática |
| `/:id`                                       | GET, PATCH | Consulta e edição                                      |
| `/:id/publish`                               | POST       | Publicação                                             |
| `/:id/managers`                              | GET, POST  | Consulta e atribuição administrativa                   |
| `/:id/managers/revoke`                       | POST       | Revogação administrativa                               |
| `/:id/registrations`                         | GET, POST  | Consulta e criação de inscrições                       |
| `/:id/registrations/:registrationId/approve` | POST       | Aprovação                                              |
| `/:id/registrations/:registrationId/cancel`  | POST       | Cancelamento                                           |
| `/:id/attendees`                             | GET        | Participantes                                          |
| `/:id/attendees/:registrationId/cancel`      | PATCH      | Cancelamento de participante                           |
| `/:id/tickets`                               | GET, POST  | Ingressos e lotes                                      |
| `/:id/tickets/:ticketId`                     | PATCH      | Atualização de lote/preço                              |
| `/:id/coupons`                               | GET, POST  | Cupões e cortesias                                     |
| `/:id/payments`                              | GET        | Pagamentos com projeção explícita segura               |
| `/:id/payments/:paymentId/refunds`           | POST       | Solicitação de reembolso                               |
| `/:id/refunds`                               | GET        | Consulta de solicitações                               |
| `/:id/refunds/:refundId/approve`             | POST       | Aprovação com permissão adicional                      |
| `/:id/sessions`                              | GET, POST  | Sessões                                                |
| `/:id/sessions/:sessionId/attendance`        | GET        | Presenças de uma sessão                                |
| `/:id/checkin` e `/:id/checkin/reverse`      | POST       | QR, entrada e reversão; sessão opcional                |
| `/:id/notifications`                         | POST       | Comunicação interna aos inscritos ativos               |
| `/:id/reports` e `/:id/reports/export`       | GET        | Relatório operacional e exportação JSON auditada       |

O Swagger da API inclui o grupo “Eventos — gestão por atribuição”, DTOs, validações e operações. A consulta de pagamentos usa `EventPaymentDto`; cartões e credenciais não fazem parte do modelo nem da resposta. Os relatórios agrupam os montantes por moeda e estado, com descontos, taxas, reembolsos e receita líquida dos pagamentos confirmados. Os relatórios financeiros exigem também `EVENT_PAYMENT_READ`.

## React

`EventWorkspace` em `/my-events` oferece seleção de eventos autorizados, criação, edição, publicação, inscrições, participantes, ingressos/lotes, cupões/cortesias, pagamentos, solicitações de reembolso, sessões, comunicação, credenciamento e exportações. `EventReport` apresenta os totais e `RegistrationQr` gera os QR Codes localmente.

`AppShell` mostra “Meus eventos”, “Criar evento”, “Inscrições”, “Participantes”, “Ingressos”, “Pagamentos”, “Credenciamento” e “Relatórios” conforme as permissões. O gestor não recebe os menus de financeiro geral ou utilizadores. `UsersPage` apresenta o nome “Gestor de Eventos”. `OperationsPage` e `OperationDetail` também aceitam as novas permissões, mantendo a compatibilidade dos caminhos existentes.

## Auditoria e validação

As novas tabelas usam o trigger `audit_change` existente. As mutações vinculam o contexto do pedido por `bindAudit`; o `AuditLog` regista também ações explícitas de atribuição/revogação, publicação, preços, cupões/cortesias, aprovação, participantes, entradas/reversões, comunicação, reembolso e exportação.

Testes específicos: `apps/api/test/event-manager.e2e-spec.ts` e `apps/web/src/pages/events/events.test.tsx`. O teste de seed executa-o duas vezes e verifica as permissões exatas da role. A suíte específica cobre eventos próprios e de terceiros, criação, autoatribuição negada, pagamentos, dízimos, extratos, reembolsos, utilizadores/roles, revogação na mesma sessão, administradores, IDs manipulados, pesquisas e exportações.

Resultados de validação: 20 suítes / 188 testes da API e 14 ficheiros / 81 testes React passaram. Os testes de menus afetados foram repetidos após os últimos ajustes. Lint, build completo, validação Prisma e `git diff --check` passaram.

## Integrações disponíveis

Não existe checkout nem gateway de pagamentos no projeto. Os modelos permitem consultar dados de pagamentos fornecidos por uma futura integração; esta etapa não cria cobranças, não aplica cupões num checkout e não executa transferências de reembolso. Aprovar um reembolso deixa-o em `APPROVED`, com resultado explícito de execução pendente do gateway. A comunicação desta etapa usa o canal interno existente. A exportação é JSON.
