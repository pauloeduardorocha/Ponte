# Notificações internas e Web Push

Todos os endpoints abaixo exigem Bearer auth e usam o usuário da sessão; não aceitam um usuário destinatário fornecido pelo cliente.

| Método e caminho (`/api/v1`)            | Contrato                                                                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/operations/inbox`                 | Paginação existente; inclui canais INTERNAL e PUSH enviados e `readAt` por mensagem.                                                                                                                       |
| GET `/operations/inbox/unread`          | `{ count: number }`, somente mensagens do destinatário autenticado.                                                                                                                                        |
| POST `/operations/inbox/:id/read`       | Marca mensagem própria enviada como lida; idempotente; 404 para mensagem alheia.                                                                                                                           |
| POST `/operations/inbox/read-all`       | Marca todas as mensagens próprias enviadas como lidas; `{ count }`.                                                                                                                                        |
| DELETE `/operations/inbox/:id`         | Remove uma mensagem enviada da caixa do usuário autenticado; `{ count: 1 }`. Não exige permissão administrativa. 404 para mensagem alheia, removida ou não enviada; 400 para UUID inválido. Preserva o histórico de envio. |
| GET `/operations/push/config`           | `{ enabled, publicKey }`; chave pública VAPID ou null. Nunca expõe chave privada.                                                                                                                          |
| POST `/operations/push/subscriptions`   | `{ endpoint, keys: { p256dh, auth } }`; cria/atualiza inscrição própria, `{ subscribed: true }`. 400 para endpoint/chaves inválidos; 409 se pertencer a outra conta; 503 quando push não está configurado. |
| DELETE `/operations/push/subscriptions` | `{ endpoint }`; remove somente inscrição própria, idempotente; `{ subscribed: false }`.                                                                                                                    |

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
