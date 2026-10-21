# Notificações internas e Web Push

Todos os endpoints abaixo exigem Bearer auth e usam o usuário da sessão; não aceitam um usuário destinatário fornecido pelo cliente.

| Método e caminho (`/api/v1`)            | Contrato                                                                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/operations/inbox`                 | Paginação existente; inclui canais INTERNAL e PUSH enviados e `readAt` por mensagem.                                                                                                                       |
| GET `/operations/inbox/unread`          | `{ count: number }`, somente mensagens do destinatário autenticado.                                                                                                                                        |
| POST `/operations/inbox/:id/read`       | Marca mensagem própria enviada como lida; idempotente; 404 para mensagem alheia.                                                                                                                           |
| POST `/operations/inbox/read-all`       | Marca todas as mensagens próprias enviadas como lidas; `{ count }`.                                                                                                                                        |
| GET `/operations/push/config`           | `{ enabled, publicKey }`; chave pública VAPID ou null. Nunca expõe chave privada.                                                                                                                          |
| POST `/operations/push/subscriptions`   | `{ endpoint, keys: { p256dh, auth } }`; cria/atualiza inscrição própria, `{ subscribed: true }`. 400 para endpoint/chaves inválidos; 409 se pertencer a outra conta; 503 quando push não está configurado. |
| DELETE `/operations/push/subscriptions` | `{ endpoint }`; remove somente inscrição própria, idempotente; `{ subscribed: false }`.                                                                                                                    |

Enviar INTERNAL preserva a mensagem no banco antes de tentar avisar os dispositivos inscritos. Uma falha push não desfaz a entrega interna. PUSH usa a mesma caixa de entrada e exige configuração e ao menos um dispositivo que aceite o envio; falhas ficam FAILED. Inscrições expiradas (404/410) são removidas. O alerta usa texto genérico para não revelar o conteúdo na tela bloqueada. O clique abre `/inbox` e exige a sessão normal.

O envio existente continua manual (inclusive após a data de agendamento); não há novo agendador ou repetição automática de envios. Notificações de eventos também avisam os dispositivos inscritos após persistir as mensagens.

## Configuração

Gerar uma vez com `npx web-push generate-vapid-keys`. Configurar apenas na API `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` e `WEB_PUSH_SUBJECT` (por exemplo `mailto:administracao@example.org`). Guardar as mesmas chaves entre deploys. Executar a migration com `npm run db:deploy --workspace @church/api`, e publicar API e web. Sem essas variáveis a caixa interna funciona e a interface informa que push está indisponível.

As alterações de notificações devem estar versionadas no Git antes da publicação. O deploy automático da branch `main` usa os arquivos do repositório: um deploy manual com alterações locais pode ser substituído pelo próximo deploy Git sem essas alterações.

Push exige HTTPS (localhost é exceção) e consentimento explícito em cada navegador/dispositivo. Em iOS/iPadOS 16.4+, instalar no ecrã principal e abrir a aplicação instalada antes de ativar. A opção de desativar e o logout removem a inscrição deste navegador. Entrega pelo serviço do navegador é best effort; aceitação do push não comprova exibição ou leitura.

## Verificação

`apps/api/test/notifications.e2e-spec.ts` verifica a migration e os fluxos HTTP com PostgreSQL real. Por segurança exige `TEST_DATABASE_URL` de um banco descartável chamado `ponte_push_test_<hex>`; o responsável pela execução deve remover esse banco depois. Os serviços push externos são simulados nos testes: validar a entrega real requer configurar VAPID, publicar em HTTPS e ativar em um navegador/dispositivo real.

Os testes de `push.spec.ts`, `push-worker.spec.ts`, `push.test.ts`, `PushControls.test.tsx` e `Notifications.test.tsx` cobrem inscrições, permissões, expiração, isolamento, leitura e abertura segura da caixa de entrada. O build gera `sw.js` com importação de `push-worker.js`.
