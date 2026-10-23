# Notificações internas e Web Push

Os endpoints da caixa pessoal e de Web Push abaixo exigem Bearer auth e usam o usuário da sessão; não aceitam um usuário destinatário fornecido pelo cliente.

## Notificações automáticas do sistema

| Evento                             | Destinatários                                 | Quando é enviado                                                                           | Preferência da conta          |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------- |
| Novo pedido de reembolso de evento | Contas ativas com `EVENT_REFUND_APPROVE`      | Depois de uma solicitação válida ser persistida                                            | `pushEventRefundRequested`    |
| Empréstimo em atraso               | Conta ativa vinculada ao membro do empréstimo | Uma vez quando o empréstimo muda para `OVERDUE`; a manutenção periódica não repete o aviso | `pushLibraryOverdue`          |
| Reserva disponível                 | Conta ativa vinculada ao membro da reserva    | Quando a fila atribui um exemplar e muda a reserva para `READY`                            | `pushLibraryReservationReady` |

Os três avisos são Web Push best-effort para dispositivos inscritos. As preferências são por usuário e aplicam-se em todos os seus dispositivos; cada uma começa ativa e pode ser alterada em **Minha conta → Notificações push**. Desativar uma categoria não altera os outros avisos nem a inscrição push do dispositivo. O endpoint `PATCH /auth/preferences` aceita qualquer combinação parcial de `colorMode`, `pushEventRefundRequested`, `pushLibraryOverdue` e `pushLibraryReservationReady`, devolvendo as preferências completas da conta. O destinatário de reserva/atraso precisa ter uma conta ligada ao membro; pedidos de reembolso são direcionados a contas ativas com a permissão de aprovação.

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

Arrays aceitam entre 1 e 100 IDs. A seleção inclui a união dos participantes atuais (`active: true`, `leftAt: null`) e dos líderes, co-líderes e anfitriões cadastrados nos grupos/ministérios. Membros inativos ou anonimizados são excluídos. Cada membro recebe uma única mensagem mesmo se pertencer a várias opções selecionadas. Cada mensagem conserva seu próprio estado de envio e leitura no histórico e na caixa pessoal. Os destinatários do agendamento são definidos no momento da criação; o envio após a data continua manual, por mensagem.

O envio coletivo retorna `{ total, sent, failed, pending, status }`, com status `SENT`, `FAILED`, `PARTIAL` ou `PENDING`. Falhas do provedor em um destinatário não impedem a tentativa aos seguintes. O formulário apresenta as quatro contagens, incluindo envios parciais. Seleção ambígua ou sem membros ativos retorna 400; acesso global sem escopo retorna 403; grupo, ministério ou role inexistente/inacessível retorna 404. O envio individual mantém sua resposta anterior.

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

Criar uma notificação sem `scheduledAt` tenta enviá-la imediatamente e devolve o estado final (`SENT` ou `FAILED`). Canais sem provedor retornam 409 antes de criar um envio imediato. Com `scheduledAt`, o registro fica `PENDING` e o envio continua manual após a data; não há agendador automático. Notificações de eventos também avisam os dispositivos inscritos após persistir as mensagens.

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
