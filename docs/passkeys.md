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

## Convite após login e próximos acessos

Depois de um login com senha, o Ponte oferece a criação de uma passkey quando o
navegador disponibiliza um autenticador local, como Windows Hello, Touch ID ou o
autenticador do Android. O convite aparece no destino original do login. Não é
mostrado ao restaurar uma sessão nem depois de entrar com passkey.

O utilizador confirma em **Ativar neste dispositivo** antes de abrir a janela do
sistema. Esse cadastro solicita um autenticador `platform`; a criação manual em
**Minha conta** continua a permitir outros autenticadores, incluindo chaves físicas.
**Agora não**, Escape e o fecho do diálogo adiam o convite por 30 dias para aquela
conta, navegador e origem. O cadastro manual continua disponível nesse período.

O fluxo reutiliza os endpoints de cadastro existentes: a senha que acabou de ser
validada fica apenas na memória do componente, no máximo por cinco minutos, para
a reautenticação em `POST /auth/passkeys/register/options`. Fechar o convite,
concluir o cadastro ou terminar a sessão descarta esse estado. Não há senha, PIN,
biometria ou token de sessão nas preferências persistidas.

Depois da verificação do cadastro no servidor, ou de um login bem-sucedido com
passkey, o navegador guarda uma indicação versionada em `localStorage`, por conta
e origem, com o identificador público da credencial. Essa indicação apenas decide
se o próximo login deve abrir a confirmação automaticamente, no desktop e no
mobile. Cada autenticação continua a exigir WebAuthn e verificação no servidor.
Não há como enumerar silenciosamente todas as passkeys que o sistema possui.

Cancelar ou falhar a autenticação automática mantém senha e botão de nova
tentativa disponíveis. A opção **Sair** suspende a abertura automática naquela
aba, evitando uma entrada imediata; uma autenticação posterior bem-sucedida
retoma essa preferência. Apagar a credencial conhecida em **Minha conta** limpa
a indicação correspondente. Limpar os dados do navegador também apaga as
preferências, sem apagar a credencial guardada pelo sistema.

Credenciais e preferências são vinculadas ao domínio usado no cadastro. Uma
passkey criada em `ponte-umber.vercel.app` não é transferida para
`www.igrejaponte.com` por este fluxo; o utilizador deve cadastrar no domínio
atual. A disponibilidade de rosto, impressão digital ou PIN é controlada pelo
sistema e pelo navegador.

## Validação

`passkeys.test.tsx` e `passkey-onboarding.test.tsx` verificam o contrato HTTP e a
interface com a API e o autenticador simulados: convite após senha, confirmação
explícita, adiamento, recusa/cancelamento, redirecionamento, login seguinte nas
duas larguras de tela, remoção e saída explícita. A confirmação física de PIN ou
biometria exige validação num dispositivo real compatível.

Também foi executado um teste local no Chrome com autenticador virtual interno,
nas larguras de 1440 e 390 px. A API foi interceptada apenas para o teste, com
geração de opções e verificação criptográfica reais pelo SimpleWebAuthn. Foram
confirmados cadastro, assinatura no acesso seguinte, preservação do destino,
saída sem reentrada automática e diálogo sem overflow. Esse teste não utilizou
a API ou a base de dados de produção.
