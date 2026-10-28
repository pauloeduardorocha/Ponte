# Notificações internas e Web Push

Os endpoints da caixa pessoal e de Web Push abaixo exigem Bearer auth e usam o usuário da sessão; não aceitam um usuário destinatário fornecido pelo cliente.

## Notificações automáticas do sistema

O catálogo cobre quatro categorias independentes: novos pedidos na fila financeira de reembolsos, pedidos de reembolso de inscrições em eventos, empréstimos em atraso e reservas prontas para retirada.

| Evento                                       | Destinatários                                                                                                          | Quando é enviado                                                                           | Preferência da conta          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------- |
| Novo pedido na fila financeira de reembolsos | Contas ativas com `FINANCE_TRANSACTION_READ` e `FINANCE_TRANSACTION_UPDATE`, inclusive concedidas por roles diferentes | Após a criação confirmada do pedido e anexos                                               | `pushReimbursementRequested`  |
| Novo pedido de reembolso de evento           | Contas ativas com `EVENT_REFUND_APPROVE`                                                                               | Depois de uma solicitação válida ser persistida                                            | `pushEventRefundRequested`    |
| Empréstimo em atraso                         | Conta ativa vinculada ao membro do empréstimo                                                                          | Uma vez quando o empréstimo muda para `OVERDUE`; a manutenção periódica não repete o aviso | `pushLibraryOverdue`          |
| Reserva disponível                           | Conta ativa vinculada ao membro da reserva                                                                             | Quando a fila atribui um exemplar e muda a reserva para `READY`                            | `pushLibraryReservationReady` |

Os quatro avisos são Web Push best-effort para dispositivos inscritos. As preferências são por usuário e aplicam-se em todos os seus dispositivos; cada uma começa ativa e pode ser alterada em **Minha conta → Notificações push**. Desativar uma categoria não altera os outros avisos nem a inscrição push do dispositivo. O endpoint `PATCH /auth/preferences` aceita qualquer combinação parcial de `colorMode`, `pushReimbursementRequested`, `pushEventRefundRequested`, `pushLibraryOverdue` e `pushLibraryReservationReady`, devolvendo as preferências completas da conta. O destinatário de reserva/atraso precisa ter uma conta ligada ao membro. Reembolsos de inscrições exigem também leitura dos pagamentos e acesso ao evento.

O clique abre `/finance?tab=reimbursements` para a fila financeira, `/my-events?event=<id>&section=refunds` para inscrições e `/` para a biblioteca pessoal. O service worker aceita apenas destinos da mesma origem em uma lista de rotas conhecidas; destinos inválidos abrem `/inbox`. Estes alertas automáticos não criam mensagens na caixa interna. Não há reenvio retroativo ao ativar uma preferência nem repetição automática de falhas; avisos são tentados após confirmar a transação. Uma falha de entrega não cancela o pedido nem remove seus anexos.

Uma reserva pode ficar disponível imediatamente ao ser criada, quando um exemplar é cadastrado ou liberado por devolução/encerramento de empréstimo, ou quando a expiração/cancelamento de outra reserva libera um exemplar. Todos esses caminhos convergem na promoção da fila para `READY` e usam o mesmo aviso, sem duplicar a cada manutenção.

Não há atualmente estados separados de rejeição de reembolso nem lembretes recorrentes de atraso; esses casos não geram avisos adicionais.

## Envio por público

`POST /operations/notifications` exige `NOTIFICATION_SEND`. Além de `channel`, `content`, `subject` e `scheduledAt`, escolha exatamente um público:

- `recipientMemberId`: um membro, preservando o contrato individual.
- `recipientVisitorId`: um visitante, preservando o contrato individual.
- `recipientMemberIds`: array de UUIDs de membros ativos acessíveis ao remetente.
- `recipientVisitorIds`: array de UUIDs de visitantes acessíveis ao remetente.
- `smallGroupIds`: array de UUIDs de grupos familiares ativos no escopo de gestão do remetente.
- `ministryIds`: array de UUIDs de ministérios ativos no escopo de gestão do remetente.
- `roleIds`: array de UUIDs das roles de contas ativas vinculadas a membros; exige também `OPERATION_SCOPE_ALL`.
- `allMembers: true`: todos os membros ativos; exige também `OPERATION_SCOPE_ALL`.

Arrays aceitam entre 1 e 100 IDs. A seleção inclui a união dos participantes atuais (`active: true`, `leftAt: null`) e dos líderes, co-líderes e anfitriões cadastrados nos grupos/ministérios. Membros inativos ou anonimizados são excluídos. Cada membro recebe uma única mensagem mesmo se pertencer a várias opções selecionadas. Cada mensagem conserva seu próprio estado de envio e leitura no histórico e na caixa pessoal. Os destinatários do agendamento são definidos no momento da criação; o envio é automático a partir da data, na próxima execução disponível do worker.

O envio coletivo retorna `{ total, sent, failed, pending, status }`, com status `SENT`, `FAILED`, `PARTIAL` ou `PENDING`. Falhas do provedor em um destinatário não impedem a tentativa aos seguintes. `pending` inclui mensagens agendadas e mensagens aguardando retentativa; a interface apresenta **Pendentes**. Seleção ambígua ou sem membros ativos retorna 400; acesso global sem escopo retorna 403; grupo, ministério ou role inexistente/inacessível retorna 404. O envio individual mantém a resposta de notificação, incluindo seu estado.

`GET /operations/notification-audiences/:kind` aceita `small-groups`, `ministries` ou `roles` e os parâmetros `search`, `page` e `pageSize` (máximo 100). Exige `NOTIFICATION_SEND` e retorna `{ items: [{ id, name }], total, page, pageSize }`. Apenas opções no escopo autorizado são oferecidas. Roles usam o nome de exibição quando disponível e exigem escopo global. Os campos de seleção no formulário permitem várias opções da mesma categoria.

Exemplo: `{ "smallGroupIds": ["63b80123-eefa-4f48-a877-6cfdcdd4b724"], "channel": "INTERNAL", "content": "Encontro nesta semana." }`.

O formulário usa multiselect com pesquisa, caixas de seleção e nomes selecionados para membros, visitantes, grupos familiares, ministérios e roles. A lista permanece aberta para selecionar ou desmarcar várias opções. Membros e visitantes usam os novos campos de arrays, com resposta coletiva mesmo para uma única escolha; os campos individuais da API continuam disponíveis para clientes existentes. IDs repetidos nos arrays são removidos antes da criação. Todos os destinatários explícitos são validados antes de criar as mensagens: se algum estiver inacessível, nenhuma mensagem da seleção é criada. A troca do tipo de público limpa os destinatários anteriores.

| Método e caminho (`/api/v1`)            | Contrato                                                                                                                                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/operations/inbox`                 | Paginação existente; inclui canais INTERNAL e PUSH enviados e `readAt` por mensagem.                                                                                                                                       |
| GET `/operations/inbox/unread`          | `{ count: number }`, somente mensagens do destinatário autenticado.                                                                                                                                                        |
| POST `/operations/inbox/:id/read`       | Marca mensagem própria enviada como lida; idempotente; 404 para mensagem alheia.                                                                                                                                           |
| POST `/operations/inbox/read-all`       | Marca todas as mensagens próprias enviadas como lidas; `{ count }`.                                                                                                                                                        |
| DELETE `/operations/inbox/:id`          | Remove uma mensagem enviada da caixa do usuário autenticado; `{ count: 1 }`. Não exige permissão administrativa. 404 para mensagem alheia, removida ou não enviada; 400 para UUID inválido. Preserva o histórico de envio. |
| GET `/operations/push/config`           | `{ enabled, publicKey }`; chave pública VAPID ou null. Nunca expõe chave privada.                                                                                                                                          |
| POST `/operations/push/subscriptions`   | `{ endpoint, keys: { p256dh, auth } }`; cria/atualiza inscrição própria, `{ subscribed: true }`. 400 para endpoint/chaves inválidos; 409 se pertencer a outra conta; 503 quando push não está configurado.                 |
| DELETE `/operations/push/subscriptions` | `{ endpoint }`; remove somente inscrição própria, idempotente; `{ subscribed: false }`.                                                                                                                                    |

Enviar INTERNAL preserva a mensagem no banco antes de tentar avisar os dispositivos inscritos. Uma falha push não desfaz a entrega interna. PUSH usa a mesma caixa de entrada e exige configuração e ao menos um dispositivo que aceite o envio; falhas ficam FAILED. Inscrições expiradas (404/410) são removidas. O alerta usa o assunto como título (ou “A Ponte” quando ausente) e a mensagem como corpo. Mensagens longas recebem uma prévia com reticências para respeitar o limite de tamanho do push; a mensagem completa continua na caixa interna. O clique abre `/inbox` e exige a sessão normal.

Criar uma notificação sem `scheduledAt` persiste a mensagem e a intenção de entrega na mesma transação e tenta enviá-la depois do commit. A resposta pode ser `SENT`, `FAILED` ou `PENDING` quando aguarda uma retentativa. Canais sem provedor retornam 409 antes de criar um envio imediato. Com `scheduledAt`, o registro fica `PENDING` e a intenção fica `HELD` até a data; o worker a libera automaticamente a partir desse instante, segundo o relógio do PostgreSQL. Isso também vale para agendamentos pendentes já existentes. Datas futuras são filtradas antes de limitar o lote, para não bloquear mensagens vencidas. O horário é um limite mínimo: o envio depende da próxima execução do worker, prevista a cada cinco minutos e sujeita a atrasos do GitHub, indisponibilidade e tamanho da fila. Notificações de eventos também avisam os dispositivos inscritos após persistir as mensagens.

## Outbox de notificações operacionais

`notification_deliveries` mantém uma intenção única por notificação. As mensagens
e as intenções são criadas atomicamente, incluindo os públicos coletivos. O envio
externo acontece depois de confirmar uma reserva curta no banco; nenhum pedido
Bird/Web Push ocorre dentro da transação que bloqueia a mensagem. A caixa
`INTERNAL` é entregue inteiramente no banco, com um alerta push best-effort depois
do commit. Os quatro avisos automáticos do catálogo acima continuam best-effort;
esta outbox cobre os envios administrativos de `/operations/notifications`.

| Estado da intenção | Comportamento                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `HELD`             | Agendamento aguardando a data; pendência antiga sem data continua manual               |
| `READY`            | Intenção confirmada aguardando primeira tentativa ou backoff                                |
| `PROCESSING`       | Reserva de dois minutos com token exclusivo; envio e cancelamento concorrentes retornam 409 |
| `DELIVERED`        | Persistência interna ou aceitação pelo provedor confirmada; notificação `SENT`              |
| `FAILED`           | Rejeição definitiva ou falha conhecida; notificação `FAILED`                                |
| `UNCERTAIN`        | Não há confirmação segura do resultado; notificação `FAILED` com indicação de revisão       |
| `CANCELLED`        | Intenção cancelada antes de iniciar o envio; notificação `CANCELLED`                        |

O worker recupera intenções `READY` vencidas e reservas expiradas. A posse do token
é conferida ao confirmar o resultado: um worker antigo não sobrescreve a tentativa
atual. As mensagens continuam no histórico quando uma tentativa falha.

E-mails usam a chave estável `notification-<id>` e guardam o corpo JSON já serializado,
incluindo destinatário e remetente, antes da primeira chamada. Uma impressão SHA-256
da credencial detecta mudanças de configuração sem guardar a chave Bird. A Bird documenta proteção de
aceitação idempotente por **três horas** para a mesma chave e pedido idêntico.
Esta implementação limita a recuperação a **duas horas** e **três tentativas**,
com espera mínima de um minuto e depois cinco minutos. Erros de transporte,
timeout, HTTP 409/429 e 5xx podem ser retentados; respostas repetidas de rejeição
continuam sujeitas ao limite de tentativas. O mesmo corpo e a mesma chave são
usados mesmo quando a primeira resposta se perde.

O destinatário é revalidado antes de cada tentativa. Mudança de endereço, conta
inativa/anonimizada, alteração do payload/remetente/credencial ou expiração da janela segura
interrompem o reenvio. Se uma tentativa anterior puder ter sido aceita, o resultado
fica `UNCERTAIN`; o payload é conservado para reconciliação. Após entrega confirmada,
cancelamento ou falha conhecida, a cópia adicional do payload é removida da outbox.
O histórico original da notificação segue a retenção existente.

Reservas, prazos e backoff usam o relógio do PostgreSQL, evitando decisões diferentes
entre instâncias da API. O cancelamento também é recusado quando uma tentativa
anterior ainda pode ter sido aceita, mesmo durante o backoff.

Web Push não oferece aqui uma garantia equivalente de aceitação idempotente:
um resultado incerto ou uma reserva expirada fica para revisão, sem reenvio
automático. A tag estável da notificação ajuda os navegadores a substituir alertas,
mas não comprova uma única entrega. Para `INTERNAL`, o push de aviso continua sem
garantia e a mensagem permanece acessível na caixa.

`SENT` de EMAIL/PUSH significa **aceitação**, não entrega na caixa de e-mail,
exibição no dispositivo ou leitura. Antes de recriar uma mensagem marcada como
entrega sem confirmação, conferir o histórico do provedor pela chave/ID e
reconciliar o resultado. A aplicação não rearma automaticamente mensagens
`FAILED`/`UNCERTAIN` nem cria uma nova chave para contornar uma rejeição.

Referência do provedor: [idempotência Bird](https://bird.com/docs/guides/idempotency).

### Ativar o processamento de recuperação

1. Publicar a migration `20261027190000_notification_outbox` com
   `npm run db:deploy --workspace @church/api`, usando `ADMIN_DATABASE_URL` direto
   do proprietário. Esse comando reaplica os privilégios do login restrito para
   a nova tabela. Aplicar a migration **antes** de iniciar a nova versão da API.
   Pendências antigas sem `scheduledAt` preservam o envio manual e devem ser
   revisadas antes de reenviar. Agendamentos pendentes com intenção `HELD` são
   liberados automaticamente quando a data chega, incluindo os já existentes.
2. Configurar uma chave aleatória exclusiva com pelo menos 32 caracteres como
   `NOTIFICATION_OUTBOX_SECRET` na API (Vercel) e como secret do mesmo nome no
   GitHub Actions. Guardá-la no gestor de senhas e publicar a configuração da API.
   Não reutilizar JWT, senha do banco, senha Restic ou credencial Bird.
3. Criar a variável GitHub `PONTE_NOTIFICATION_OUTBOX_ENABLED=true`.
4. Em **Actions → Process notification outbox → Run workflow**, selecionar `main`
   e executar. Sem pendências, todas as contagens retornam zero.
5. Confirmar o sucesso, ativar notificações de falha do Actions e acompanhar o
   histórico de notificações. O workflow está agendado para cada cinco minutos;
   atrasos/inatividade do GitHub não constituem SLA de entrega.

O endpoint `POST /api/v1/internal/notification-outbox/process` exige
`Authorization: Bearer <NOTIFICATION_OUTBOX_SECRET>`. O endpoint não usa JWT de
utilizador, não aceita destinatários, conteúdo nem tamanho de lote do cliente e
não aparece no Swagger público. Sem uma chave forte configurada, responde 503;
credencial ausente/incorreta responde 401. Processa no máximo dez mensagens e
devolve somente `{ processed, sent, pending, failed, skipped }`. O rate limit
global continua aplicável. O workflow usa HTTPS, recusa redirecionamentos e
registra apenas essas contagens; falhas definitivas/incertas tornam o job vermelho.

Em produção, o workflow chama diretamente
`https://www.igrejaponte.com/api/v1/internal/notification-outbox/process`.
O domínio sem `www` redireciona com HTTP 308; não o usar para esta chamada, pois
o worker recusa redirecionamentos e não deve encaminhar o segredo a outra origem.

Publicação em 27/10/2026: API/web 1.1.6 e migration verificadas em produção,
incluindo privilégios de `church_app`. O worker respondeu 401 sem credencial e
201 com o segredo dedicado, com fila vazia e sem envios externos. A primeira
execução do workflow deve confirmar também o secret/configuração do GitHub.

A primeira tentativa após uma criação imediata funciona sem o agendamento.
Recuperação após interrupção e retentativas dependem do worker ativo. Um canal
temporariamente sem provedor configurado fica pendente até restabelecer a
configuração e não bloqueia os outros canais no lote. Lotes grandes podem exigir
várias execuções. Agendamentos `HELD` com data vencida passam pelas mesmas
garantias e limites dos envios imediatos. Podem ser cancelados antes da reserva
de envio; disputas entre envio manual, worker e cancelamento são serializadas
no banco. Não há nova migration nem nova credencial para ativar esse comportamento.
O cancelamento bloqueia intenções ainda
não iniciadas; uma entrega já iniciada precisa primeiro concluir ou ser reconciliada.

### Testes da outbox

```sh
npm run test:integration -- --notifications-only
```

Usa PostgreSQL real descartável via Compose e transportes simulados, sem enviar
mensagens reais. Cobre rollback da criação, falha no commit da reserva antes do
transporte, aceitação antes de falha no commit final, disputa entre workers,
cancelamento, backoff, janela idempotente, mudança de destinatário/payload,
limite de tentativas e tokens antigos. Os testes de segurança verificam também o
processamento da outbox com o login restrito. O CI normal inclui essas suítes.

O envio agendado cobre os canais EMAIL, PUSH e INTERNAL com transportes simulados:
nenhum envio antes da data, datas futuras sem bloquear o lote, recuperação de
agendamentos vencidos após reiniciar o worker, backoff, cancelamento antes da
reserva e dois workers concorrentes sem duplicação. Pendências antigas sem data
continuam fora do processamento automático.

Validação do envio automático em 27/10/2026: 38 testes de integração de
notificações/operações e 14 do login restrito aprovados com PostgreSQL 17
descartável via Docker Compose; 43 testes unitários dos provedores, públicos e
worker, 26 do formulário, TypeScript de API/web e lint dos arquivos alterados
aprovados. No worktree Windows foi usado temporariamente o glob
`**/test/**/*.e2e-spec.ts`, pois o Jest não reconheceu o caminho expandido com
`.codex`; a configuração original foi restaurada após a execução. Transportes
externos foram simulados, sem enviar e-mail ou push reais.

Validação local em 27/10/2026: 153 testes de integração e 14 do login restrito
aprovados; os dois testes exclusivos de documentos do modo `--recovery-only`
ficaram ignorados na rodada normal. A suíte unitária completa da API passou
(51 arquivos, 430 testes), incluindo replay do corpo exato e mudança de credencial.
Frontend: 40 testes de operações/formulários aprovados.
TypeScript de API e web, ESLint dos arquivos alterados, build de produção,
parsing do workflow/OpenAPI e revisão do diff aprovados. Os testes Node e-Fatura
passaram com a exclusão de navegador Linux esperada no Windows. Não foram
enviados e-mails/push reais nem aplicada migration em produção nesta etapa.

A remoção pessoal grava `inboxDeletedAt`: mensagens removidas deixam de aparecer na caixa, na contagem de não lidas e nas operações de leitura, mas continuam no histórico administrativo. O agendamento usa o seletor nativo de data e hora, convertido do fuso do dispositivo para UTC ao salvar.

## Configuração

Gerar uma vez com `npx web-push generate-vapid-keys`. Configurar apenas na API `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` e `WEB_PUSH_SUBJECT` (por exemplo `mailto:administracao@example.org`). Guardar as mesmas chaves entre deploys. Executar a migration com `npm run db:deploy --workspace @church/api`, e publicar API e web. Sem essas variáveis a caixa interna funciona e a interface informa que push está indisponível.

As alterações de notificações devem estar versionadas no Git antes da publicação. O deploy automático da branch `main` usa os arquivos do repositório: um deploy manual com alterações locais pode ser substituído pelo próximo deploy Git sem essas alterações.

Push exige HTTPS (localhost é exceção) e consentimento explícito em cada navegador/dispositivo. Em iOS/iPadOS 16.4+, instalar no ecrã principal e abrir a aplicação instalada antes de ativar. A opção de desativar e o logout removem a inscrição deste navegador. Entrega pelo serviço do navegador é best effort; aceitação do push não comprova exibição ou leitura.

No primeiro acesso autenticado em um dispositivo compatível, a aplicação convida a ativar notificações para acompanhar os avisos, eventos e novidades da igreja. O pedido nativo ocorre ao clicar em “Ativar notificações”. O convite espera qualquer cadastro de passkey terminar e respeita “Agora não”, guardado por usuário neste navegador. Na caixa de notificações, o aviso continua visível enquanto os alertas não estiverem ativos, incluindo instruções quando a permissão estiver bloqueada. Permissões já negadas não geram novos pedidos nativos automáticos.

Um aviso no cabeçalho de todas as páginas autenticadas também permite ativar os alertas. O usuário pode dispensá-lo; a preferência é lembrada por conta neste navegador, sem esconder os controles e o lembrete da caixa de entrada. O aviso desaparece quando as notificações estão ativas. Permissões bloqueadas mostram um link para as instruções na caixa de entrada.

## Verificação

`apps/api/test/notifications.e2e-spec.ts` verifica a migration e os fluxos HTTP com PostgreSQL real. Por segurança exige `TEST_DATABASE_URL` de um banco descartável chamado `ponte_push_test_<hex>`; o responsável pela execução deve remover esse banco depois. Os serviços push externos são simulados nos testes: validar a entrega real requer configurar VAPID, publicar em HTTPS e ativar em um navegador/dispositivo real.

Os testes de `push.spec.ts`, `push-worker.spec.ts`, `push.test.ts`, `PushControls.test.tsx` e `Notifications.test.tsx` cobrem inscrições, permissões, expiração, isolamento, leitura e abertura segura da caixa de entrada. O build gera `sw.js` com importação de `push-worker.js`.

### Consistência do relógio — 28/10/2026

A disponibilidade inicial da intenção é definida explicitamente com o relógio do
PostgreSQL na mesma transação de criação. Assim, um default calculado pelo ORM
com o relógio de uma instância adiantada não adia nem rejeita o envio imediato.
Reserva, backoff e janela de retentativa já usam esse relógio. Um teste com
PostgreSQL real simula o default de um host adiantado e confirma o envio imediato;
as fixtures de expiração e do login restrito seguem o mesmo caminho de criação.
A janela segura de duas horas e os limites de tentativas não foram alterados.
