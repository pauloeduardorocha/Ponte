# Church Management

Monorepo de gestão de igreja com API NestJS/Prisma/PostgreSQL e React/Vite/MUI.
Inclui autenticação JWT, usuários, autorização centralizada, membros, visitantes,
eventos, biblioteca, financeiro, importação bancária, relatórios e auditoria.
A infraestrutura, health check e proxy Nginx/Vite são preservados.

## Requisitos

Para publicar frontend, API e PostgreSQL nos planos gratuitos Vercel/Neon,
consulte [o guia de deployment](docs/vercel-deployment.md).

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
docker compose up -d
# Depois de alterar o código/imagens:
docker compose up -d --build
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

Cria `superadmin@ponte.example` (SUPER_ADMIN), `admin@ponte.example` (ADMIN),
`secretaria@ponte.example` (SECRETARY),
`membro@ponte.example` (MEMBER), `biblioteca@ponte.example` (LIBRARY) e
`financeiro@ponte.example` (FINANCE), três membros fictícios, visitante, evento,
livro, três exemplares, dois empréstimos (um atrasado), multa, categorias
hierárquicas, conta EUR, fornecedor, quatro receitas, duas despesas,
três contribuições e uma importação privada com **150 movimentos** em revisão.
As seis contas usam a
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
  fornecido pelo cliente. A atribuição de roles usa `PATCH /api/v1/users/{id}/roles`
  e exige `PERMISSION_MANAGE`, disponível para ADMIN e SUPER_ADMIN. Não é permitido
  alterar as próprias roles, delegar permissões superiores às suas ou remover o
  último SUPER_ADMIN ativo. Na UI, use **Usuários → Gerir roles** para selecionar
  múltiplos perfis e salvar. Perfis superiores às permissões do operador ficam bloqueados.
- ADMIN gerencia usuários, roles e membros; SECRETARY lê/cria/edita membros, mas não
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

## Financeiro

O menu **Financeiro** inclui resumo, receitas, despesas, categorias, contas,
fornecedores, contribuições e documentos privados de despesas. A migration
`20261007120000_finance` adiciona as entidades, permissões e a hierarquia inicial
Receitas (Dízimos, Ofertas, Doações, Eventos) e Despesas (Pessoal, Aluguel, Energia,
Água, Internet, Manutenção, Eventos). A role FINANCE recebe as permissões
financeiras e SUPER_ADMIN recebe os novos códigos; ADMIN e MEMBER não recebem
acesso financeiro automaticamente. O seed inclui `financeiro@ponte.example`,
com a senha local explicitamente configurada, para demonstração.

### API financeira

Prefixo `/api/v1/finance`, autenticação Bearer e autorização por requisição.

| Recurso                     | Operações                            | Permissões                                                                 |
| --------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| `/categories`               | GET, POST, PATCH `/:id`              | FINANCE_CATEGORY_READ / WRITE                                              |
| `/accounts`                 | GET, POST, PATCH `/:id`              | FINANCE_ACCOUNT_READ / WRITE                                               |
| `/suppliers`                | GET, POST, PATCH `/:id`              | FINANCE_SUPPLIER_READ / WRITE                                              |
| `/incomes`, `/expenses`     | GET, POST, PATCH `/:id`              | FINANCE_TRANSACTION_READ / CREATE / UPDATE                                 |
| `/contributions`            | GET, POST, PATCH `/:id`              | FINANCE_CONTRIBUTION_READ; escrita também exige FINANCE_CONTRIBUTION_WRITE |
| `/dashboard`                | GET                                  | FINANCE_DASHBOARD_READ                                                     |
| `/expenses/:id/attachments` | GET, POST multipart com campo `file` | FINANCE_ATTACHMENT_READ / WRITE                                            |
| `/attachments/:id/download` | GET                                  | FINANCE_ATTACHMENT_READ                                                    |

Listagens usam `{items,total,page,pageSize}`, página padrão 1, tamanho padrão 20,
máximo 100; cadastros permitem pesquisa por nome. Receitas/despesas aceitam
`accountId` e `status`. PATCH preserva campos omitidos; null limpa opcionais.
DTOs rejeitam campos desconhecidos, inclusive qualquer credencial bancária.
Não há exclusão de registros financeiros: use CANCELLED para cancelar
lançamentos e INACTIVE para desativar contas, preservando o histórico.

- Categoria: `name`, `kind` INCOME/EXPENSE, `parentId` opcional. Tipo imutável;
  pais devem ter o mesmo tipo e ciclos são rejeitados.
- Conta: `bank`, `name`, `branch`, `account`, `iban`, `currency` ISO 4217,
  `openingBalance` decimal, `status` ACTIVE/INACTIVE. Moeda e saldo inicial
  ficam bloqueados após a primeira movimentação/importação.
- Fornecedor: `name`, `taxId`, `email`, `phone`.
- Receita: `amount`, `date`, `categoryId`, `accountId`, `description`, `origin`,
  `memberId` opcional, `costCenter`, `reference`, `status`, `bankTransactionId`
  opcional. Vincular origem bancária exige FINANCE_RECONCILE; valor, data e
  conta devem coincidir com a transação bancária.
- Despesa: `amount`, `date`, `dueDate`, `paidAt`, `categoryId`, `supplierId`
  opcional, `accountId`, `costCenter`, `description`, `document`, `status`.
  COMPLETED exige `paidAt`; PENDING/CANCELLED exigem ausência de pagamento.
- Contribuição: `incomeId` único, `memberId` e `type`
  TITHE/OFFERING/DONATION/OTHER. Receita e membro são imutáveis após o vínculo;
  a associação atualiza também o membro da receita e é auditada atomicamente.

Valores positivos em DECIMAL(14,2), entradas e saídas como strings decimais,
sem floats ou câmbio. Datas são `YYYY-MM-DD`; mês do dashboard é UTC.
O resumo separa totais por moeda: receitas/despesas COMPLETED do mês pela data
do lançamento, saldo inicial + receitas concluídas até hoje - despesas pagas
até hoje, pendências de todas as datas, dízimos e ofertas concluídos do mês e
as dez últimas transações. Contas inativas continuam compondo o histórico.

FINANCE_CONTRIBUTION_READ protege os vínculos e os detalhes identificadores
em receitas, dashboard e respostas de alterações. Sem essa permissão,
receitas vinculadas exibem somente ID, valor, data, categoria, conta, status e
uma descrição genérica. Os indicadores de dízimos/ofertas são omitidos.
Alterar receitas vinculadas exige essa permissão adicional. MEMBER_READ não
concede acesso financeiro ou acesso às contribuições.

`Contribution → Income → BankTransaction → BankImport → storageKey/filename`
preserva a origem. A listagem de contribuições autorizada inclui a transação
e os metadados do arquivo, sem expor a chave privada. Esta versão prepara
os modelos de origem bancária; parser/importador de extratos será um módulo
posterior, e não há endpoint público para inserir origens arbitrárias.

### Arquivos privados e auditoria

StorageService grava arquivos com UUID aleatório fora da árvore pública,
com permissões restritas; nenhuma rota estática serve esse diretório.
`PRIVATE_STORAGE_PATH` configura o local. No Docker, o volume
`financial_storage` persiste `/app/private-storage` como usuário node.
Em Windows, configure também as ACLs da pasta para a conta do processo.
Backups devem incluir banco e volume de documentos. Múltiplas réplicas precisam
compartilhar storage ou usar outro adapter de StorageService.

Uploads limitados a 10 MB; somente PDF, JPEG e PNG com MIME, extensão e
assinatura compatíveis. A API rejeita outros formatos e campos multipart.
Download autenticado usa `Content-Disposition: attachment`, `no-store` e
`nosniff`; os arquivos nunca recebem URL pública. A interface envia o token
em memória ao enviar/baixar documentos.

Cada criação/alteração e vínculo financeiro grava AuditLog na mesma transação.
Falha de auditoria reverte a alteração; arquivo recém-enviado é removido se a
transação falhar. Downloads também são auditados. Um advisory lock PostgreSQL
serializa mutações financeiras, incluindo validação de hierarquia e vínculos.
As suites HTTP usam schemas aleatórios e diretórios temporários exclusivos;
TEST_DATABASE_URL é obrigatório para biblioteca e financeiro.

## Importação bancária

Em **Financeiro → Importação bancária**, escolha a conta e um CSV, XLSX ou OFX
(até 10 MB e 10000 movimentos), e clique em **Importar extrato**. Os movimentos
válidos cadastram receitas e despesas concluídas automaticamente, com a categoria
**Sem categoria**. O arquivo original e os vínculos são preservados. A tela mostra
os movimentos importados; **Histórico de importações** abre os arquivos anteriores.

Categorias podem ser escolhidas na própria linha, em grupos de movimentos da
mesma direção, ou posteriormente nas listas de **Receitas** e **Despesas**.
A edição mantém a categoria do movimento e do registro financeiro sincronizadas.
O formulário detalhado permite associar membros, contribuições e fornecedores.
Sugestões de membros exigem uma escolha explícita; nunca criam uma contribuição
apenas por reconhecer um nome na descrição.

Arquivos repetidos e movimentos com identificador bancário já importado são
marcados como ignorados, sem novos lançamentos. Correspondências ambíguas de
conta/data/valor/direção aguardam revisão e só são cadastradas depois de aceite
explícito. Essa revisão não impede o cadastro dos movimentos válidos do extrato. Receitas
e despesas manuais com a mesma conta, data e valor também geram uma pendência;
use **Vincular a receita/despesa existente** para preservar o registro anterior
sem cadastrar outro lançamento.
O processamento e a criação dos lançamentos são atômicos e usam o mesmo lock
transacional das mutações financeiras. Falhas preservam o original, mostram o
motivo e não deixam lançamentos parciais.

CSV aceita UTF-8/Windows-1252, vírgula, ponto e vírgula ou tabulação e cabeçalhos
em português/inglês. XLSX reconhece introduções e as variações Millennium com ou
sem saldo; fórmulas são rejeitadas e o ZIP é limitado a 40 MB. OFX aceita SGML/XML.
Conta e moeda identificadas no arquivo devem corresponder ao cadastro. Dinheiro
usa Decimal; datas ambíguas não são inferidas. Valor, data, conta e pagamento
vindos do extrato são preservados; categoria, descrição e associações podem ser
editadas conforme as permissões financeiras.

Após importar, a tela pergunta se deseja **Buscar faturas no e-Fatura**. Informe
NIF e senha das Finanças; o serviço consulta o período completo do extrato e
importa o resultado diretamente, sem exportar ou carregar JSON. A senha passa
por um canal IPC privado para o processo de consulta, não é gravada em arquivos,
argumentos de linha de comando, banco ou logs. A consulta tem limite de dois
minutos e uma execução por instância da API. Se houver MFA/CAPTCHA, falha de
login ou indisponibilidade do portal, a tela informa o problema e o extrato
continua cadastrado. É possível tentar novamente pelo botão de busca.

**Associar fatura** mostra candidatos por valor e moeda, ordenados pela
proximidade da data, fornecedor e referência/NIF na descrição. A associação
exige confirmação, pois valores iguais podem corresponder a documentos diferentes.
A origem e os registros financeiros podem ser consultados nos detalhes do movimento.

Upload, consulta e download exigem FINANCE_BANK_IMPORT e FINANCE_CONTRIBUTION_READ.
A consulta ao e-Fatura também exige FINANCE_INVOICE_READ e FINANCE_INVOICE_IMPORT;
associação de documentos exige FINANCE_INVOICE_ASSOCIATE. Associar contribuições
exige FINANCE_CONTRIBUTION_WRITE.

Principais endpoints sob /api/v1/finance:

| Endpoint                                   | Operação                                                       |
| ------------------------------------------ | -------------------------------------------------------------- |
| POST /banking/imports                      | Extrato multipart com accountId e file; cadastro automático    |
| GET /banking/imports, /banking/imports/:id | Histórico e detalhe                                            |
| GET /banking/imports/:id/download          | Download privado do original                                   |
| GET /banking/transactions                  | Movimentos, filtros e paginação                                |
| POST /banking/transactions/:id/link        | Vincular a receita/despesa existente com confirmação explícita |
| POST /banking/classify                     | Categoria opcional, associações e revisão de duplicados        |
| GET /banking/transactions/:id/suggestions  | Sugestões de membros                                           |
| POST /invoices/fetch                       | bankImportId, nif e password; consulta direta ao portal        |
| GET /invoices/suggestions/:transactionId   | Sugestões de faturas                                           |
| POST /invoices/:id/association             | Associação explícita da fatura ao movimento                    |

A tela não possui uma etapa de conciliação. BankReconciliation permanece como
estrutura interna de integridade e histórico; os endpoints legados de confirmar,
vincular e desfazer continuam disponíveis para compatibilidade, com as permissões
originais. Nenhuma migração adicional de banco é necessária para este fluxo;
as duas categorias **Sem categoria** são criadas no primeiro uso.

## Relatórios financeiros

Em **Financeiro → Relatórios**, escolha o relatório, o período e os filtros e clique em **Gerar relatório**. Há receitas/despesas por período e categoria, fluxo de caixa, saldo por conta, dízimos/ofertas/doações, contribuições por membro, despesas por fornecedor, movimentos bancários não conciliados e evolução mensal.

Os valores usam Decimal e são separados por moeda. O padrão é considerar lançamentos COMPLETED; relatórios de lançamentos também permitem PENDING e CANCELLED. O fluxo de caixa e saldo utilizam a data do lançamento para receitas e a data de pagamento para despesas, sempre concluídas. Saldo inicial do período = saldo inicial cadastrado na conta + receitas anteriores − pagamentos anteriores. Os valores anteriores e o saldo cadastrado têm links próprios. Saldo por conta aceita conta/período; os demais filtros são oferecidos conforme o tipo de relatório. Status bancário é separado do status dos lançamentos. Centro de custo ainda não se aplica a movimentos não conciliados.

Cada linha aponta para Income/Expense ou BankTransaction; as origens bancárias preservam BankImport e o arquivo original, e contribuições apontam para Contribution. Grupos incluem os IDs de suas linhas de origem. Relatórios e exportações usam uma leitura consistente do banco. Há limite de 10.000 registros/fontes por relatório: refine filtros quando necessário; não há truncamento silencioso. Pesquise os filtros de conta, categoria, membro e fornecedor pelo nome (até 100 resultados por pesquisa).

CSV e XLSX incluem identificação, período, filtros, linhas, totais, grupos e IDs de origem. CSV neutraliza células que poderiam ser interpretadas como fórmulas; XLSX usa valores textuais explícitos. PDF está disponível para o relatório individual de contribuições, com membro obrigatório, igreja, período, tipos, valores, origens, referências, totais e observações. É apoio à preparação de informações fiscais, não uma declaração fiscal oficial e não substitui contabilista. A identificação da igreja pode ser informada na tela ou configurada em CHURCH_NAME, CHURCH_TAX_ID e CHURCH_ADDRESS.

API: GET `/api/v1/finance/reports?report=incomes&start=2026-01-01&end=2026-01-31`; exportação em `/api/v1/finance/reports/export` com os mesmos filtros e `format=csv|xlsx|pdf`. Os filtros são `accountId`, `categoryId`, `memberId`, `supplierId`, `costCenter`, `status`, `bankStatus` e `contributionType` quando aplicáveis. Tipos: `incomes`, `expenses`, `cash-flow`, `account-balances`, `income-categories`, `expense-categories`, `tithes`, `offerings`, `donations`, `member-contributions`, `supplier-expenses`, `unreconciled`, `monthly-evolution`, `contribution-statement`.

FINANCE_TRANSACTION_READ permite relatórios gerais; FINANCE_CONTRIBUTION_READ é obrigatório para dados de membros, filtros por membro/tipo e extratos. FINANCE_BANK_IMPORT também é obrigatório para não conciliados. FINANCE_CONTRIBUTION_EXPORT é obrigatório para exportações de contribuições/membros e de extratos; exportações gerais sem essa permissão omitem identidade, descrição, referência e origem de receitas que possam identificar membros. Cada exportação registra FINANCE_REPORT_EXPORT em AuditLog (usuário, horário, relatório, filtros, formato e quantidade de registros). Se o registro de auditoria falhar, o arquivo não é entregue. Não existem links públicos de exportação; downloads exigem sessão e usam no-store.

## Segurança e privacidade

Consulte [a revisão de segurança e auditoria](docs/SECURITY_REVIEW.md) para os controles implementados, permissões de auditoria, APIs de privacidade e preparação para produção.

## Painéis, interface e operação em lote

O painel inicial consulta dados reais apenas dos domínios autorizados. ADMIN
acompanha membros, visitantes, eventos, biblioteca e valores financeiros gerais;
os nomes, origens e referências de contribuições continuam protegidos por
FINANCE_CONTRIBUTION_READ. As novas permissões VISITOR_READ/WRITE e
EVENT_READ/WRITE controlam os respectivos cadastros. A migration atualiza
ADMIN e SUPER_ADMIN; perfis personalizados precisam de concessão explícita.

Os indicadores levam às listas correspondentes. O financeiro permite escolher
mês e conta, separa moedas e mostra evolução dos últimos seis meses, pendências,
últimos lançamentos, não conciliados e última importação. Os links de receitas,
despesas e contribuições preservam o período selecionado. Biblioteca mostra
circulação do acervo, atrasos, multas e livros mais emprestados.

Verde identifica créditos/conclusões; vermelho identifica débitos/atrasos/erros;
amarelo identifica pendências/duplicidades; azul identifica informação e
classificações. Textos e legendas acompanham as cores. Os gráficos oferecem
valores legíveis também por leitores de tela, sem biblioteca adicional de gráficos.

Em **Financeiro → Importação bancária**:

1. Escolha conta e CSV/XLSX/OFX; importe para cadastrar receitas e despesas.
2. Busque faturas informando NIF e senha, ou escolha **Agora não**.
3. Categorize os movimentos aqui ou depois nas listas de Receitas e Despesas.
4. Confira possíveis duplicados e confirme as associações sugeridas de faturas.
5. Use **Histórico de importações** e **Origem e registros financeiros** para rastrear os dados.

Cadastros/listas oferecem feedback, carregamento, erro, vazio, pesquisa,
paginação e validação. A barra de seleção bancária acompanha a rolagem em
desktop; em telas pequenas permanece no fluxo para não cobrir os movimentos.

### Performance

Paginação e filtros são executados na API. O dashboard financeiro agrega
valores por moeda em SQL, com leitura consistente e número constante de
consultas, sem consultar cada conta/moeda individualmente. Índices apoiam
datas/status, conta/importação, relações de classificação e anexos. Relações
das listas são carregadas em consultas de conjunto, evitando N+1.

TanStack Query mantém cache curto na sessão (painéis: 30 segundos), invalidado
após mutações e limpo ao sair. Pesquisa bancária/visitantes/eventos usa debounce.
Financeiro, biblioteca, visitantes/eventos, usuários, conta e auditoria são
carregados por rota com React.lazy/Suspense. Bibliotecas compartilhadas têm
chunks próprios; o painel da biblioteca foi separado dos formulários/catálogo.

### Seed no Docker

Defina SEED_DEMO_PASSWORD em `.env` (12–128 caracteres; apenas demonstração).
Após iniciar a stack local:

```bash
docker compose --profile demo run --rm seed
```

O perfil é opcional e usa o mesmo banco e volume privado da stack local.
Nunca execute esse perfil contra produção. O seed usa IDs estáveis e preserva
cadastros/senhas já existentes; datas da demonstração são calculadas na primeira
execução e não alteradas nas seguintes. O CSV original fica no armazenamento
privado; seus movimentos são fictícios e podem ser revisados na interface.

### API / Swagger

Em desenvolvimento, abra `/api/v1/docs`; a especificação OpenAPI está em
`/api/v1/docs-json`. O plugin Swagger do Nest compila schemas dos DTOs,
campos obrigatórios, limites, enums e formatos validados. Operações protegidas
são identificadas com Bearer JWT. Swagger fica desativado em produção. Consulte também a
[especificação OpenAPI gerada](docs/openapi.json).

Novos endpoints:

| Endpoint                                      | Acesso / filtros                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GET `/api/v1/community/dashboard`             | Resposta limitada a MEMBER_READ, VISITOR_READ, EVENT_READ presentes                         |
| GET `/api/v1/community/visitors`              | VISITOR_READ; search, status, page, pageSize                                                |
| POST/PATCH `/api/v1/community/visitors[/:id]` | VISITOR_WRITE; criação/retificação auditadas                                                |
| GET `/api/v1/community/events`                | EVENT_READ; search, status, page, pageSize                                                  |
| POST/PATCH `/api/v1/community/events[/:id]`   | EVENT_WRITE; criação/retificação auditadas                                                  |
| GET `/api/v1/finance/dashboard`               | FINANCE_DASHBOARD_READ; month=YYYY-MM, accountId                                            |
| GET `/api/v1/finance/banking/transactions`    | Também search, direction=CREDIT/DEBIT, categoria/período, pageSize até 100                  |
| GET `/api/v1/finance/incomes`, `/expenses`    | Também categoria, período, conta, status; pesquisa de receitas exige acesso a contribuições |
| GET `/api/v1/finance/contributions`           | type=TITHE/OFFERING/DONATION/OTHER, conta, período e paginação                              |

### Deploy

Configure segredos aleatórios distintos, CORS_ORIGIN com o endereço HTTPS
real, credenciais de PostgreSQL e identificação da igreja. Publique o Nginx
atrás de proxy com TLS; mantenha PostgreSQL e armazenamento privado fora de
acesso público. POSTGRES_PORT permite mudar a porta local, vinculada apenas a
127.0.0.1. Faça backups **do banco e do volume financial_storage** juntos.

Antes de publicar: execute lint/test/build, faça backup, revise migrations e
atualize imagens com `docker compose up -d --build`. Verifique health check,
login/refresh, permissões e downloads privados. Use uma conta de banco de dados
de execução separada da conta de migrations conforme `runtime-privileges.sql`.
Após novas tabelas, reaplique os grants revisados. Não use o seed em produção.

Para executar a regressão com PostgreSQL real:

```powershell
$env:TEST_DATABASE_URL='postgresql://usuario:senha@localhost:5432/banco_de_testes?schema=public'
npm run lint
npm run test
npm run build
```

Use banco de testes dedicado. As suítes financeiras/bancárias/seed criam schemas
isolados; algumas suítes de identidade/biblioteca criam e removem seus próprios
fixtures no schema informado. Consulte [o acabamento e a validação](docs/UX_FINISH.md).

## Operação e vida da igreja — Etapa 9

Visitantes e eventos foram ampliados preservando seus dados e endpoints legados.
O menu inclui acompanhamento, grupos familiares, ministérios, escalas, presenças e
notificações, além do painel exclusivamente operacional em /operations.

Os novos endpoints ficam em /api/v1/operations. Líderes possuem acesso limitado
às suas responsabilidades, com seletores de membros por nome e projeções mínimas.
Permissões pastorais não concedem acesso a contribuições ou documentos financeiros.
Conversões, participação histórica, inscrições, conflitos, substituições e
presenças possuem validação no banco e auditoria.

Após atualizar, execute as duas migrations incrementais com
npm run db:deploy --workspace @church/api e gere o cliente com npm run db:generate.
O seed existente acrescenta exemplos operacionais sem trocar senhas ou apagar
registros. Para gestores de liderança, configure também o vínculo User.memberId.

Consulte [os módulos, permissões, endpoints e fluxos](docs/CHURCH_OPERATIONS.md).
Swagger e docs/openapi.json incluem os novos contratos. Adaptadores de email,
SMS, WhatsApp e push estão preparados para integração futura; nesta etapa o
sistema persiste notificações internas e mantém canais externos sem provedor
pendentes, sem simular envio.

## Faturas do e-fatura

A busca está integrada à importação bancária. A imagem Docker da API inclui
Chromium e o scraper. No desenvolvimento local, instale as dependências com
`npm ci --prefix apps/scrapper`; Puppeteer instala o navegador necessário.
Para usar Chromium já instalado, configure PUPPETEER_EXECUTABLE_PATH.

Consulte [configuração, filtros, permissões e exportação independente](docs/EFATURA.md).
