# Etapa 9 — Operação e vida da igreja

## Arquitetura e compatibilidade

Os cadastros existentes de Visitor e CommunityEvent foram ampliados; não há uma
segunda tabela de visitantes ou eventos. As rotas antigas em /community continuam
disponíveis, com aliases name/visitedAt e name/startsAt, e delegam as alterações ao
mesmo OperationsService usado por /operations. Os registros e as migrations
anteriores foram preservados.

OperationsModule reutiliza PrismaService, AuthGuard, PermissionGuard,
AsyncLocalStorage e bindAudit. O cliente React usa TanStack Query, React Hook Form,
as cores e os componentes de apresentação existentes. Nenhum módulo operacional
consulta Income, Expense, Contribution ou documentos financeiros.

Os vínculos a Member usam projeções explícitas id/name/status. Opções de usuário
contêm apenas id/name. Notas administrativas, consentimentos, documentos,
credenciais e valores financeiros não são incluídos nessas projeções.

## Migrations

- 20261008010000_church_operations: amplia visitantes/eventos, adiciona acompanhamento,
  grupos familiares, ministérios, inscrições, escalas, presenças e notificações; acrescenta
  índices, foreign keys, checks, unicidades parciais e triggers de auditoria.
- 20261008020000_operations_compatibility: rastreia o criador do visitante, preserva
  as permissões legadas de escrita e configura as permissões operacionais de
  PASTOR/LEADER.

Execute npm run db:generate e npm run db:deploy --workspace @church/api. Não use
reset ou db push sobre dados existentes. Os campos name e visitedAt/startsAt
continuam canônicos no banco; firstVisitDate/title/startDateTime/endDateTime são
aliases no novo contrato REST. A divisão dos nomes legados respeita os limites
dos novos campos e mantém o nome original completo.

## Permissões e escopo

| Módulo         | Consulta          | Alterações                       |
| -------------- | ----------------- | -------------------------------- |
| Visitantes     | VISITOR_READ      | VISITOR_CREATE, VISITOR_UPDATE   |
| Acompanhamento | FOLLOWUP_READ     | FOLLOWUP_CREATE, FOLLOWUP_UPDATE |
| Grupos familiares        | SMALL_GROUP_READ  | SMALL_GROUP_MANAGE               |
| Ministérios    | MINISTRY_READ     | MINISTRY_MANAGE                  |
| Eventos        | EVENT_READ        | EVENT_MANAGE                     |
| Escalas        | SCHEDULE_READ     | SCHEDULE_MANAGE                  |
| Presenças      | ATTENDANCE_READ   | ATTENDANCE_MANAGE                |
| Comunicação    | NOTIFICATION_READ | NOTIFICATION_SEND                |

OPERATION_SCOPE_ALL permite consultas globais apenas nos módulos cujas permissões
o usuário também possui. ADMIN/SUPER_ADMIN e PASTOR recebem esse escopo. LEADER
recebe permissões operacionais, com acesso restrito ao membro vinculado ao usuário,
à sua liderança de grupos familiares/ministérios, aos seus eventos, acompanhamentos atribuídos,
visitantes convidados/criados e convocações. A configuração de liderança usa o
vínculo User.memberId; definir uma função no histórico de participação não altera
as permissões da conta.

O responsável não pode reatribuir acompanhamento a outro usuário nem transferir
a liderança principal sem acesso global. A busca por pessoas retorna somente
nomes/identificadores/situação; gestores podem pesquisar nomes com pelo menos dois
caracteres para convidar novos participantes. As operações continuam validando
escopo, pessoa ativa e atividade.

VISITOR_WRITE e EVENT_WRITE continuam funcionando nas rotas antigas. A migration
copia essas autorizações para VISITOR_CREATE/VISITOR_UPDATE e EVENT_MANAGE. Essas
permissões legadas mantêm o escopo global que possuíam anteriormente. Novas contas
de líderes usam as permissões granulares, sem as autorizações legadas.

Nenhuma permissão operacional concede acesso financeiro. FINANCE permanece
separado. Auditoria geral exige também OPERATION_SCOPE_ALL e leitura dos novos
domínios, além das autorizações financeiras/administrativas anteriores.

## Endpoints

Todas as rotas abaixo começam em /api/v1/operations e exigem JWT.

| Recurso             | Rotas                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Dashboard           | GET /dashboard, filtros start/end                                                         |
| Seletores           | GET /people, GET /assignees, GET /identity                                                |
| Visitantes          | GET/POST /visitors, PATCH /visitors/:id                                                   |
| Conversão/histórico | POST /visitors/:id/convert, GET /visitors/:id/history                                     |
| Acompanhamentos     | GET/POST /follow-ups, PATCH /follow-ups/:id                                               |
| Contatos            | GET/POST /follow-ups/:id/interactions                                                     |
| Grupos familiares             | GET/POST /small-groups, PATCH /small-groups/:id                                           |
| Ministérios         | GET/POST /ministries, PATCH /ministries/:id                                               |
| Participação        | GET/POST /small-groups/:id/participants ou /ministries/:id/participants                   |
| Saída               | POST /small-groups/:id/participants/:participantId/leave ou equivalente em /ministries    |
| Eventos             | GET/POST /events, PATCH /events/:id                                                       |
| Inscrições          | GET/POST /events/:id/registrations, POST /events/:id/registrations/:registrationId/cancel |
| Escalas             | GET/POST /schedules, PATCH /schedules/:id                                                 |
| Convocações         | GET/POST /schedules/:id/assignments, PATCH /schedules/:id/assignments/:assignmentId       |
| Resposta pessoal    | POST /schedules/:id/assignments/:assignmentId/respond                                     |
| Substituição        | POST /schedules/:id/assignments/:assignmentId/replace                                     |
| Presenças           | GET/POST /attendance, PATCH /attendance/:id                                               |
| Notificações        | GET/POST /notifications, POST /notifications/:id/send ou /cancel                          |
| Modelos             | GET/POST /notification-templates, PATCH /notification-templates/:id                       |

Listas possuem page/pageSize (máximo 100), busca e filtros aplicáveis: status,
start/end, active, memberId, visitorId, assignedToUserId, leaderMemberId,
meetingDay, eventId, ministryId e smallGroupId. A data final inclui o dia inteiro.
Presenças retornam também summary por situação sobre todos os registros filtrados,
independentemente da página.

Swagger interativo: /api/v1/docs em desenvolvimento. O contrato estático atualizado
está em docs/openapi.json.

## Fluxos e integridade

- Conversão: preserva Visitor, cria vínculo Member, registra ator/data e auditoria.
  Email, telefone e nome/data de nascimento identificam possíveis pessoas existentes.
  Correspondências exigem escolha explícita; conversões simultâneas são serializadas
  e repetições retornam o vínculo existente. Converter exige VISITOR_UPDATE e MEMBER_CREATE.
- Acompanhamento: uma pessoa por processo, responsável ativo, estados e interações
  cronológicas paginadas. O ator da interação vem da sessão, nunca do formulário.
- Participação: cada entrada gera um vínculo histórico; saída preenche leftAt e
  active=false. Índices parciais impedem duas participações ativas iguais. Um membro
  pode participar de vários ministérios. Grupos familiares respeitam capacidade.
- Eventos: intervalo válido, capacidade positiva e inscrições concorrentes protegidas.
  Cancelamento preserva inscrições e cancela escalas abertas do evento.
- Escalas: conflitos usam o intervalo do evento, incluindo limite exclusivo no fim.
  Convocações sobrepostas são bloqueadas; alterações de evento/escala também são
  verificadas e revertidas se criarem conflito. A substituição mantém a convocação
  anterior com REPLACED e registra o vínculo de substituição. Respostas pessoais
  permitem apenas CONFIRMED/DECLINED ao membro vinculado à sessão.
- Presenças: exatamente uma pessoa; no máximo uma atividade; unicidade por
  pessoa/atividade/data, incluindo a identidade de visitantes convertidos. O histórico do membro inclui essas presenças anteriores. Alterações administrativas são auditadas. MANUAL/EVENT/
  SMALL_GROUP são atribuídos pelo servidor, não pelo cliente.
- Privacidade: a anonimização aprovada já existente também limpa cópias pessoais
  em visitantes convertidos, acompanhamentos, interações e mensagens, preservando
  vínculos históricos e auditoria sujeita à política de retenção.

Locks transacionais e constraints fazem a validação de concorrência no servidor,
não apenas na interface. O lock das escalas é global nesta etapa para garantir
consistência entre eventos; pode ser particionado com cuidado se o volume exigir.

## Páginas e operação

Menu: Pessoas (Membros, Visitantes, Acompanhamento), Grupos (Grupos familiares, Ministérios),
Operação (Vida da igreja, Eventos, Escalas, Presenças), Comunicação (Notificações).
O painel /operations é exclusivamente operacional.

Há estados de carregamento/vazio/erro, pesquisa com debounce, filtros básicos e
avançados, paginação, formulários consistentes, seletores por nome, feedback e
confirmação de cancelamentos/saídas/inativações. Detalhes permitem registrar contatos,
consultar históricos, administrar participantes/inscrições e responder/substituir
voluntários. O painel respeita permissões e oferece links para as listas.

## Seed

O seed de demonstração permanece opt-in em desenvolvimento, com SEED_DEMO=true
e SEED_DEMO_PASSWORD configurado, usando npm run db:seed. Reutiliza usuários e membros
anteriores sem trocar suas senhas nem substituir edições existentes.

Inclui grupo familiar com líder/anfitrião/participantes, ministério de recepção, acompanhamento
com interação, evento, escala com voluntário confirmado, presença de visitante,
modelo de boas-vindas e notificação interna pendente. Todos usam IDs estáveis.

## Comunicação preparada para evolução

NotificationProvider é injetado como coleção de adaptadores. INTERNAL usa a
persistência privada como entrega. EMAIL/SMS/WHATSAPP/PUSH ficam PENDING enquanto
não houver provedor configurado; o sistema não simula envio externo.

O sino no topo abre /inbox, com a caixa pessoal acessível a qualquer conta autenticada e limitada ao membro verificado da sessão. Mensagens pendentes ou de outros destinatários não são expostas.

Envio é explícito e respeita scheduledAt. Falhas de adaptadores configurados são
registradas como FAILED com mensagem genérica. Antes de integrar provedores externos,
adicionar worker/outbox, idempotência de entrega, política de consentimento,
retentativas e processamento de agendamentos. A infraestrutura de presenças permite
novas entradas de check-in/QR/kiosk/importação, ainda não implementadas.

## Validação

Executar npm run lint, npm run test e npm run build. Testes de banco usam schemas
PostgreSQL aleatórios com todas as migrations, sem apagar dados da aplicação.

Cobertura nova: conversão/idempotência/correspondências, acompanhamento/reatribuição,
participação/capacidade/histórico, ministérios, inscrições concorrentes, conflitos
e mudanças de horário, substituição/resposta pessoal, presenças/duplicação/totais,
RBAC/IDOR/projeções, notificações, anonimização operacional e seed repetível.
O frontend testa proteção das rotas, paginação, histórico, confirmação de saída,
feedback de conflitos, cadastro e painel sem consultas financeiras.

## Resultado da revisão

- Migrations aplicadas em desenvolvimento e em schemas novos dos testes;
  comparação Prisma entre banco e schema sem diferenças.
- Lint e build aprovados; regressão completa com 150 testes de API e 68 de frontend.
- Swagger atualizado: 116 caminhos e 71 schemas, incluindo caixa pessoal e aliases legados.
- Seed de demonstração executado sem substituir senhas ou edições existentes.
- No Windows, o cliente Prisma exigiu encerrar a API para regenerar a DLL carregada.
  O processo Jest em execução sequencial apresentou encerramentos nativos sem
  falha de asserção; a execução passou com dois workers e limite de memória de
  256 MB para reciclagem. A causa nativa não foi determinada.
- Um teste da biblioteca precisava aguardar a restauração da acessibilidade após
  a animação de saída do diálogo; as verificações de idempotência foram mantidas.
- O lint também reconhece o ambiente CommonJS do script de scraping paralelo,
  cujo conteúdo e execução permanecem fora desta etapa.
- Inspeção visual manual em desktop/mobile continua recomendada; a validação de
  frontend desta etapa usa testes de componentes e fluxos.
