# Passkeys no Ponte

Em **Minha conta → Biometria e passkeys**, indique o nome do dispositivo e confirme a senha atual para registar uma passkey. No login, selecione **Entrar com biometria ou passkey**. O sistema escolhe impressão digital, reconhecimento facial ou PIN. O fluxo funciona no navegador e no PWA instalado, com suporte do sistema operativo e navegador. A senha continua disponível.

## Configuração e publicação

Aplicar a migration `20261016140000_passkeys` antes de publicar a API e o frontend (`npm run db:deploy --workspace @church/api`). Não executar `migrate dev` contra produção. A migration concede acesso às duas novas tabelas à role `church_runtime`, se existir.

`CORS_ORIGIN` deve conter a origem exata do frontend (sem barra final), incluindo o domínio usado pelo PWA. HTTPS é obrigatório; HTTP só é aceite em localhost fora de produção. O RP ID é o hostname dessa origem, validada contra a configuração do servidor, sem confiar em Host ou cabeçalhos de proxy. Cada hostname tem passkeys próprias; manter um domínio estável e criar a passkey no domínio final. Não é necessário configurar um segredo biométrico.

## Contrato da API

Todos os caminhos têm prefixo `/api/v1/auth/passkeys`. POST e DELETE exigem um cabeçalho Origin permitido. Os endpoints de registo, listagem e remoção exigem Bearer da sessão atual.

| Método e caminho         | Corpo                                                            | Resposta                                                                                               |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| GET `/`                  | —                                                                | 200: lista de `{ id, name, createdAt, lastUsedAt }`, sem chaves públicas                               |
| POST `/register/options` | `{ password }` (senha atual, até 128 caracteres)                 | 200: `{ challengeId, options }` para WebAuthn create                                                   |
| POST `/register/verify`  | `{ challengeId, response, name }` (nome entre 1 e 80 caracteres) | 200: `{ message }`                                                                                     |
| POST `/login/options`    | — (público, sem email)                                           | 200: `{ challengeId, options }` para WebAuthn get                                                      |
| POST `/login/verify`     | `{ challengeId, response }` (público)                            | 200: `{ accessToken, user }` e cookie HttpOnly `refresh_token` com as mesmas regras do login com senha |
| DELETE `/{id}`           | —                                                                | 204; só remove uma passkey da própria conta                                                            |

`response` é a resposta JSON do SimpleWebAuthn browser. UUID inválido ou corpo inválido: 400. Falha criptográfica, senha incorreta, conta inativa/apagada, desafio expirado/reutilizado: 401. Origin ausente, inválido ou sem HTTPS: 403. Limite de 10 pedidos por minuto por endpoint/IP: 429. Desafios duram cinco minutos, têm finalidade/origem/utilizador associados e são consumidos atomicamente antes de verificar a prova. Um erro exige começar novamente em `/options`.

O servidor exige user verification no registo e login e valida origem, RP ID, desafio, assinatura e contador. As chaves privadas e dados biométricos nunca são enviados ao Ponte. Os dados públicos das credenciais e os desafios ficam no Postgres, compatíveis com instâncias serverless. Desafios expirados são limpos ao criar novos desafios. As ações de registo, login e remoção ficam na auditoria.

Remover uma passkey impede novos logins com ela; sessões já emitidas mantêm o prazo/revogação normal. Alterar a senha não remove passkeys: para um dispositivo perdido, remover a passkey pela conta; a mudança de senha já revoga as sessões existentes.

## Validação manual em dispositivos

No domínio HTTPS final, testar Android/Chrome e iPhone/Safari, tanto no navegador como no PWA: registar, sair, entrar com passkey, cancelar a confirmação, entrar com senha, remover a passkey e verificar que esta deixa de permitir login. Repetir após fechar e reabrir o PWA. Os testes automáticos não confirmam o comportamento de um sensor biométrico real.
