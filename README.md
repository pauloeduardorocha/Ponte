# Church Management

Monorepo de gestão de igreja com API NestJS/Prisma/PostgreSQL e React/Vite/MUI.
Inclui autenticação JWT, usuários, autorização centralizada, CRUD de membros e
biblioteca completa (catálogo, exemplares, circulação, reservas e multas).
A infraestrutura, health check e proxy Nginx/Vite são preservados.

## Requisitos

- Node.js 22.13 ou superior e npm 10 ou superior
- Docker Engine e Docker Compose v2 para executar a stack completa
- Para desenvolvimento local: PostgreSQL 17 ou Docker para iniciá-lo

## Estrutura

```text
apps/
  api/       NestJS, Prisma, Swagger e Jest
  web/       React, Vite, Router, TanStack Query, React Hook Form e MUI
packages/
  shared/    Contratos e tipos compartilhados
```

## Instalação e desenvolvimento local

```powershell
Copy-Item .env.example .env
# Configure DATABASE_URL e os dois segredos aleatórios distintos em .env.
npm install
docker compose up -d postgres
npm run db:generate
npm run db:deploy --workspace @church/api
npm run build --workspace @church/shared
npm run dev
```

A API e a aplicação web são executadas localmente por `npm run dev`; no ambiente
de desenvolvimento, o Vite encaminha `/api` para `http://localhost:3000`.

- Web: <http://localhost:5173>
- API: <http://localhost:3000/api/v1>
- Health check: <http://localhost:3000/api/v1/health>
- Swagger/OpenAPI: <http://localhost:3000/api/v1/docs> (fora de produção)

## Docker Compose

Após criar `.env` a partir do exemplo e configurar `POSTGRES_PASSWORD`, inicie
toda a stack:

```bash
docker compose up --build
```

O Compose aguarda o PostgreSQL ficar saudável antes de iniciar a API. A API
aplica as migrations de produção (`prisma migrate deploy`) e o frontend aguarda
o health check da API. O frontend é servido pelo Nginx e encaminha requisições
`/api/` para a API sem expor o hostname interno dos containers ao navegador.

```bash
docker compose ps
docker compose logs -f api
docker compose down
```

Para remover também os dados persistidos do PostgreSQL, use
`docker compose down --volumes`. Isso apaga permanentemente o volume local do
banco.

## Banco de dados, migrations e seed

O Prisma usa `DATABASE_URL`; o exemplo local conecta a
`localhost:5432`, enquanto o Compose define a conexão interna para o serviço
`postgres`. O schema mantém as estruturas-base de identidade, permissões e auditoria.
A migration `auth_users_members` adiciona nome do usuário, famílias de refresh,
recuperação de senha e membros, sem alterar a migration inicial.

```bash
npm run db:generate
npm run db:migrate -- --name nome_da_migration
npm run db:deploy --workspace @church/api
npm run db:studio
```

`db:migrate` é o fluxo de desenvolvimento (`prisma migrate dev`). `db:deploy`
aplica migrations existentes sem criá-las, como esperado em produção.

### Seed explicitamente de desenvolvimento

Não é executado automaticamente no Docker ou na inicialização. Em `.env`, use
`NODE_ENV=development`, `SEED_DEMO=true` e defina `SEED_DEMO_PASSWORD` (12-128
caracteres, exclusivamente local). Execute:

```powershell
npm run build --workspace @church/shared
npm run db:seed
```

Cria `admin@ponte.example` (ADMIN), `secretaria@ponte.example` (SECRETARY),
`membro@ponte.example` (MEMBER), `biblioteca@ponte.example` (LIBRARY), três
membros fictícios, um livro e o exemplar `DEMO-001`. As quatro contas usam a
senha configurada **na primeira execução**. Reexecutar não duplica registros,
não troca senhas, não reativa contas e não sobrescreve membros editados.
As permissões das roles iniciais são sincronizadas com `ROLE_PERMISSIONS`.
Use apenas banco local descartável; o seed recusa produção, falta de opt-in e
senha ausente/fraca. Não há senha administrativa padrão nem criação pública de
administradores. Provisionamento de roles em produção fica a cargo de um
operador confiável do banco, não de um endpoint público.

Para demonstrar a biblioteca, entre com `biblioteca@ponte.example` usando a
senha local configurada no seed. Abra **Biblioteca**, consulte **Membros /
histórico** para obter o ID do membro, depois **Exemplares → Emprestar**.
Use **Empréstimos** para renovar/devolver, **Catálogo → Reservar** para criar
a fila e **Configurações** para ajustar políticas. Não há credencial fixa.
O seed preserva livros, exemplares e settings existentes nas reexecuções.

## Autenticação e segurança

- Argon2id para senhas (12-128 caracteres). E-mails normalizados.
- Access JWT HS256 (15 minutos), com issuer/audience e referência à sessão.
  Fica somente em memória no frontend, nunca em localStorage/sessionStorage.
- Refresh opaco aleatório (256 bits), somente em cookie HttpOnly/SameSite=Strict,
  Secure em produção. Banco guarda apenas hash HMAC-SHA256 com
  `JWT_REFRESH_SECRET`, diferente do segredo de access. Duração absoluta de 7 dias.
- Rotação transacional, detecção de replay e revogação de toda a família.
  Locks por usuário serializam refresh, logout, troca de senha e desativação.
  Logout invalida imediatamente o access da família; trocar/resetar senha ou
  desativar invalida todas as sessões. Reativar não restaura sessões revogadas.
- `AuthGuard` e `PermissionGuard` globais; `@Permission(...)` exige todas as
  permissões declaradas, consultadas no banco por requisição. MEMBER não lê
  usuários ou membros de outras pessoas. Não há endpoints de senha com userId
  fornecido pelo cliente nem endpoints de atribuição de roles.
- ADMIN gerencia usuários e membros; SECRETARY lê/cria/edita membros, mas não
  exclui nem gerencia usuários; PASTOR lê membros; MEMBER usa apenas a própria
  conta. O frontend oculta navegação e ações e protege rotas, sem substituir a
  autorização backend.
- LIBRARY possui somente permissões `LIBRARY_*`, não ganha `MEMBER_READ`,
  acesso à identidade ou financeiro. SUPER_ADMIN possui todas. As migrations
  aditivas provisionam os códigos e a role LIBRARY; incluem as permissões da
  biblioteca em SUPER_ADMIN já existente, sem remover grants personalizados,
  sem atribuir roles a usuários e sem alterar estrutura ou dados de usuários/membros.
- DTOs rejeitam campos desconhecidos, UUIDs/filtros/ordenação inválidos e
  paginação fora dos limites (page >= 1, pageSize 1-100). Health permanece público.
- Limite de 100 requisições/minuto/IP global e 10/minuto/IP por endpoint auth.
  Storage de rate limit é em memória por processo; múltiplas réplicas precisam
  de storage compartilhado antes de escalar. Não habilite trust proxy
  indiscriminadamente.
- Cookies são restritos ao caminho `/api/v1/auth` e origem é validada nas
  operações com cookies. Use os proxies same-origin existentes. Em produção,
  publique por HTTPS; Secure/SameSite não deve ser enfraquecido para acomodar
  hosts HTTP separados.

### Recuperação de senha (e-mail ainda não integrado)

`POST /auth/forgot-password` responde a mesma mensagem genérica para contas
existentes e inexistentes. Cria token de 30 minutos, armazenado como hash, de
uso único; uma nova solicitação invalida a anterior. `PasswordResetDelivery`
é o ponto de integração futuro: substitua `PendingEmailDelivery` por um adapter
que envie um link para `/reset-password?token=...`. O adapter atual **não envia
e-mail** e registra aviso explícito sem e-mail/token. Nenhum endpoint devolve
token de recuperação e não há endpoint de depuração. Os testes substituem o
adapter para exercitar todo o fluxo.

## Endpoints

Prefixo: `/api/v1`. Access token em `Authorization: Bearer ...`.

| Método / caminho             | Entrada / permissão                                              |
| ---------------------------- | ---------------------------------------------------------------- |
| POST `/auth/register`        | `{name,email,password}`; público, cria apenas MEMBER             |
| POST `/auth/login`           | `{email,password}`; retorna `{accessToken,user}` e cookie        |
| POST `/auth/refresh`         | Cookie; retorna novo access e rotaciona cookie                   |
| POST `/auth/logout`          | Cookie; revoga família, limpa cookie, 204                        |
| GET `/auth/me`               | Autenticado; `{id,name,email,status,permissions}`                |
| PATCH `/auth/password`       | `{currentPassword,newPassword}`; própria conta, 204              |
| POST `/auth/forgot-password` | `{email}`; público, mensagem genérica                            |
| POST `/auth/reset-password`  | `{token,newPassword}`; público, 204                              |
| GET `/users`                 | `USER_READ`; search, page, pageSize                              |
| POST `/users`                | `USER_CREATE`; `{name,email,password}`, cria apenas MEMBER       |
| PATCH `/users/:id/status`    | `USER_UPDATE`; `{status: ACTIVE ou DISABLED}`                    |
| GET `/members`               | `MEMBER_READ`; search, status, page, pageSize, sortBy, sortOrder |
| GET `/members/:id`           | `MEMBER_READ`                                                    |
| POST `/members`              | `MEMBER_CREATE`                                                  |
| PATCH `/members/:id`         | `MEMBER_UPDATE`                                                  |
| DELETE `/members/:id`        | `MEMBER_DELETE`; 204                                             |

Listagens retornam `{items,total,page,pageSize}`. `sortBy` de membros aceita
`name`, `email`, `createdAt`; `sortOrder` aceita `asc`, `desc`, com desempate por
id. Pesquisa case-insensitive em nome/e-mail/telefone; status ACTIVE/INACTIVE.
Membros: name obrigatório; email, phone, birthDate (`YYYY-MM-DD`) e notes
opcionais/nullable; status padrão ACTIVE. PATCH omite campos não alterados,
`null` limpa opcionais. Não há campos de credenciais nos retornos de usuários.

## Biblioteca

### Endpoints e permissões

Todos usam o prefixo `/api/v1/library`, os guards centrais e DTOs com validação
de UUIDs, limites, dinheiro e campos desconhecidos. As listagens paginadas
retornam `{items,total,page,pageSize}`, pageSize padrão 20, máximo 100.

| Método / caminho                | Permissão / comportamento                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET `/books`, `/books/:id`      | `LIBRARY_BOOK_READ`; search (título/subtítulo/autor/ISBN/categoria/keyword), author, category, available=true/false |
| POST `/books`                   | `LIBRARY_BOOK_CREATE`; title e author obrigatórios, demais metadados do catálogo                                    |
| PATCH `/books/:id`              | `LIBRARY_BOOK_UPDATE`; PATCH parcial, null limpa campos nullable; capa exclusivamente HTTPS                         |
| DELETE `/books/:id`             | `LIBRARY_BOOK_DELETE`; 204, impede exclusão com exemplares/reservas/histórico                                       |
| GET `/copies`                   | `LIBRARY_COPY_READ`; bookId, status, search (patrimônio/barcode/QR/localização)                                     |
| POST `/books/:id/copies`        | `LIBRARY_COPY_CREATE`; assetCode e location obrigatórios, condition/barcode/QR/acquiredAt/notes                     |
| PATCH `/copies/:id`             | `LIBRARY_COPY_UPDATE`; metadados e AVAILABLE/MAINTENANCE/LOST/DISPOSED; justification obrigatória                   |
| GET `/copies/:id/history`       | `LIBRARY_COPY_READ` **e** `LIBRARY_HISTORY_READ`; empréstimos, multas, reservas, manutenção e auditoria             |
| GET `/loans`                    | `LIBRARY_LOAN_READ`; memberId, bookId, status; não inclui multas                                                    |
| POST `/loans`                   | `LIBRARY_LOAN_CREATE`; `{memberId,bookCopyId,observations?}`; nunca bookId                                          |
| POST `/loans/:id/return`        | `LIBRARY_LOAN_RETURN`; fecha e libera/promove exemplar                                                              |
| POST `/loans/:id/renew`         | `LIBRARY_LOAN_RENEW`; aplica limites e prioridade de reservas                                                       |
| POST `/loans/:id/close`         | `LIBRARY_LOAN_RETURN`; `{status: LOST ou CANCELLED,justification}`                                                  |
| GET `/members`                  | `LIBRARY_HISTORY_READ`; diretório mínimo id/name/status, filtro search; sem e-mail/telefone/notas                   |
| GET `/members/:id/history`      | `LIBRARY_HISTORY_READ`; ativos, histórico, atrasos, multas/pagamentos/ajustes e reservas                            |
| GET `/reservations`             | `LIBRARY_RESERVATION_READ`; memberId, bookId; ordem FIFO                                                            |
| POST `/reservations`            | `LIBRARY_RESERVATION_CREATE`; `{memberId,bookId}`                                                                   |
| POST `/reservations/:id/cancel` | `LIBRARY_RESERVATION_CANCEL`; libera hold e promove próximo                                                         |
| GET `/fines`                    | `LIBRARY_FINE_READ`; memberId, bookId, pagamentos e ajustes                                                         |
| POST `/fines/:id/payments`      | `LIBRARY_FINE_PAY`; `{amount: "1.50",idempotencyKey: UUID}`                                                         |
| POST `/fines/:id/adjustments`   | `LIBRARY_FINE_ADJUST`; `{kind: DISCOUNT,amount: "1.00",justification}` ou `{kind: FORGIVE/CANCEL,justification}`    |
| GET `/settings`                 | `LIBRARY_SETTINGS_READ`                                                                                             |
| PATCH `/settings`               | `LIBRARY_SETTINGS_UPDATE`; objeto completo de políticas                                                             |
| GET `/dashboard`                | `LIBRARY_DASHBOARD_READ`; totalBooks, totalCopies, available, loaned, overdue, pendingFines, mostBorrowed           |

`LIBRARY_HISTORY_READ` é uma autorização de **operador da biblioteca**, para
consultar históricos de qualquer membro, incluindo seus valores monetários.
`MEMBER_READ` sozinho nunca a concede: o CRUD de membros não incorpora
histórico; o frontend só monta essa seção sob a permissão específica.
Não há self-service de biblioteca nem vínculo automático por e-mail entre
User e Member: MEMBER não acessa históricos de terceiros (nem o próprio sem
provisionamento explícito). IDs fornecidos pelo cliente não burlam os guards.
Permissões de ação não implicam permissões de leitura. Frontend oculta abas,
ações e consultas sem autorização; a API permanece a autoridade.

### Circulação, tempo e carência

- Book é o registro bibliográfico, BookCopy é a unidade física. Loan referencia
  somente memberId e bookCopyId, com exclusão restrita para preservar histórico.
  Patrimônio/barcode/QR são únicos quando preenchidos.
- Defaults: defaultLoanDays=14, maxBooks=3, maxRenewals=2, graceDays=0,
  dailyFine=1.00, blockOverdue=true, holdDays=2, reservationDays=30.
- Instantes são `timestamptz`, JSON ISO-8601. O calendário de cobrança é
  **UTC**, independente do fuso do servidor/navegador e de horário de verão.
  Prazos adicionam dias de 24 horas ao instante; a exibição usa o fuso do
  navegador. Não se configura timezone nesta versão.
- Dias cobrados = max(0, dataUTC(agora) - dataUTC(dueAt) - graceDays).
  O dia de vencimento e os dias de carência não geram multa nem OVERDUE.
  O primeiro dia seguinte à carência marca OVERDUE, mesmo com diária zero.
  Exemplo: vencimento 01/10, graceDays=2 → sem atraso até 03/10 UTC;
  em 04/10 UTC, 1 diária. Não há cobrança por fração de hora.
- graceDays e dailyFine ficam congelados no empréstimo. Settings novos
  afetam novos empréstimos; prazo/limite de renovação usam settings atuais.
  O saldo é atualizado diariamente, não incrementado por chamada.
  Devolver/perder/cancelar congela a multa no dia da operação.
- Empréstimo exige membro ACTIVE, quantidade ACTIVE/OVERDUE abaixo de maxBooks,
  sem OVERDUE se blockOverdue=true e exemplar AVAILABLE ou hold do próprio
  membro. Bloqueio por multa pendente isoladamente não é aplicado.
- Renovação exige ACTIVE, membro ACTIVE, limite disponível e nenhuma reserva
  WAITING/READY de outro membro para o livro. Se blockOverdue=true, outros
  empréstimos OVERDUE do membro também bloqueiam. Novo vencimento é
  max(agora,dueAt)+defaultLoanDays; não reduz prazo existente.
- Devolver é operação única. CANCELLED libera o exemplar; LOST o mantém
  indisponível. Nenhuma dessas operações apaga ou perdoa multas automaticamente.
  Alterar status de exemplar LOANED/RESERVED exige antes encerrar empréstimo ou
  cancelar reserva; metadados podem ser corrigidos com justificativa.
- Operações e a manutenção periódica usam um advisory lock transacional único
  por banco PostgreSQL. Assim limite por membro, retirada, retorno, filas,
  pagamentos e auditoria são atômicos mesmo em réplicas concorrentes.
  Índices parciais impedem dois empréstimos ativos por exemplar, duas reservas
  ativas membro/livro e dois holds READY por exemplar. Trade-off: operações da
  biblioteca são serializadas; dimensionar/revisar antes de cargas grandes.

### Fila e expiração

- Reserva é por Book, uma WAITING/READY por membro/livro. FIFO por createdAt,
  com id como desempate. Inativos não criam reservas.
- Havendo exemplar AVAILABLE, o primeiro WAITING recebe automaticamente
  exemplar RESERVED e estado READY, readyAt e holdUntil=agora+holdDays.
  Só esse membro pode retirar. A retirada muda reserva para FULFILLED.
- A validade WAITING é expiresAt=criação+reservationDays; READY usa holdUntil
  (o prazo de retirada substitui a validade da espera). Expira quando
  limite <= agora. Cancelamento/expiração libera o hold e promove o próximo;
  devolução, cadastro de exemplar e recuperação para AVAILABLE também promovem.
- Limites/atrasos são verificados na retirada, não removem pessoas da fila:
  um membro que se tornou bloqueado mantém prioridade até holdUntil.
  O operador pode cancelar sua reserva; não há bypass para outra pessoa.
- Uma rotina a cada 60 segundos e a sincronização antes de toda operação
  mantêm atrasos, multas e expirações. Sem API em execução, convergem na próxima
  chamada/inicialização do timer. Falhas periódicas são registradas explicitamente.
  A identificação do próximo membro está na reserva READY; não há envio de
  e-mail/SMS nesta versão.

### Dinheiro e auditoria

- Valores armazenados em DECIMAL(12,2), calculados com Prisma.Decimal e enviados
  como **strings decimais** (a serialização pode remover zeros finais).
  Não enviar números JSON, notação científica ou mais de duas casas.
  Sem floats para pagamentos/diárias/saldo; frontend apresenta saldo em centavos
  inteiros. Valores representam a unidade monetária da biblioteca, sem câmbio.
- Saldo = amount - paidAmount - discount. Pagamento positivo, total ou parcial,
  nunca maior que o saldo. idempotencyKey é global e obrigatório: repetir
  mesma chave/valor/multa/operador devolve o mesmo pagamento; mudar dados dá 409.
  O formulário mantém a chave em retries enquanto estiver aberto.
- DISCOUNT requer valor positivo <= saldo. FORGIVE/CANCEL ajustam todo o saldo
  restante e exigem justificativa não vazia; não aceitam amount. Valores pagos
  e pagamentos originais são preservados, sem reembolso automático.
- PAID em empréstimo ainda ativo pode reabrir quando surgir nova diária.
  FORGIVEN/CANCELLED encerram definitivamente a cobrança desse empréstimo,
  inclusive diárias futuras: justificativa representa uma exceção integral.
  Desconto não interrompe accrual futuro.
- Ajustes são registros imutáveis FineAdjustment; pagamentos FinePayment.
  Cada mutação, accrual, expiração e promoção registra AuditLog na mesma
  transação. Falha na auditoria reverte a operação e o dinheiro.
  Dashboard soma apenas saldos OPEN; mostBorrowed agrupa por livro através
  dos exemplares e não conta empréstimos CANCELLED.

## Testes e qualidade

```bash
npm run lint
npm run test
npm run build
npm run format:check
```

Jest executa os testes da API; Vitest executa os testes da aplicação web.
Testes unitários de segurança/rate limits e health não precisam de banco.
Para também executar integrações HTTP reais e teste idempotente do seed:

```powershell
# Banco local/teste já migrado; nunca aponte para produção.
$env:TEST_DATABASE_URL = 'postgresql://USUARIO:SENHA@localhost:5432/BANCO?schema=public'
npm run test
```

A suite HTTP da biblioteca **exige** TEST_DATABASE_URL e falha sem ela; não é
silenciosamente ignorada. Biblioteca e seed aplicam migrations em schemas
aleatórios exclusivos e removem apenas esses schemas após fechar a aplicação.
As integrações antigas de auth/member continuam opt-in, usam identificadores
aleatórios e só removem seus registros. Aponte a variável para um banco local
de testes exclusivo, já migrado, nunca produção ou banco com dados de terceiros.
Não há reset do banco/container/volume.

A suite cobre concorrência de empréstimos e limites por membro, devolução,
renovação/limites/fila, UTC/carência, diária congelada, pagamentos parciais,
idempotência/double-payment, ajustes, rollback por falha de auditoria,
prioridade/expiração/promoção de reservas, indisponibilidade, permissões
granulares e ausência de exposição por MEMBER_READ. Testes web cobrem catálogo,
filtros/capa/quantidades, formulários, circulação, reservas, pagamentos/retry,
justificativas, settings, históricos e ocultação de consultas/ações sem permissão.

## Variáveis de ambiente e segurança

Copie `.env.example` para `.env`. Personalize `POSTGRES_PASSWORD` e os segredos
JWT antes de usar o projeto fora do ambiente local. `API_PORT`, `WEB_PORT` e
`CORS_ORIGIN` podem ser ajustados para desenvolvimento; ao alterar a senha do
PostgreSQL para rodar serviços localmente, atualize também a senha em
`DATABASE_URL`. Não versione `.env` nem armazene credenciais ou documentos
privados no repositório.
