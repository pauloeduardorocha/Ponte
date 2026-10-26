# Envio de emails com Bird

O Ponte usa a API de email da Bird na região europeia para recuperação de senha
(`POST /api/v1/auth/forgot-password`) e para o canal `EMAIL` das notificações
operacionais (`POST /api/v1/operations/notifications`).

## Configuração privada da API

| Variável          | Valor                                                  |
| ----------------- | ------------------------------------------------------ |
| `BIRD_API_KEY`    | Chave privada `bk_eu1_…`, com permissão `emails:write` |
| `BIRD_EMAIL_FROM` | `noreply@igrejaponte.com` (valor padrão)               |
| `PUBLIC_WEB_URL`  | URL pública do frontend, com HTTPS em produção         |

O domínio `igrejaponte.com` deve estar verificado no mesmo workspace da chave.
Configure a chave no ambiente privado da API (ou no `.env` local ignorado pelo
Git), nunca no frontend, em variáveis `VITE_`, commits, logs ou chat.
Em Vercel, configure as variáveis no projeto da API e faça um novo deploy.
O Docker Compose encaminha as três variáveis para o container da API.
Previews devem usar configuração própria e links para o respetivo frontend.

Sem chave, a aplicação continua a iniciar, mas a recuperação apenas regista um
aviso sem dados pessoais; nenhum email é enviado. Chaves de outra região ou um
remetente inválido impedem a inicialização do adaptador. A URL do frontend é
validada antes do envio: exige HTTPS, sem credenciais, query ou fragmento;
HTTP para localhost é permitido apenas fora de produção.

## Contrato de envio e recuperação

- `POST https://eu1.platform.bird.com/v1/email/messages`, com autenticação
  `Authorization: Bearer <BIRD_API_KEY>`.
- Remetente com nome `Igreja Ponte`, destinatário único, assunto, HTML e texto.
  Na recuperação, a categoria é `transactional`. Rastreamento de aberturas e
  cliques desativado em todos os envios.
- Só `202 Accepted` confirma que a Bird aceitou o pedido. Não confirma entrega
  na caixa de entrada; rejeições posteriores e bounces devem ser consultados
  na Bird. Não há webhook de entrega nesta integração.
- Timeout de 10 segundos, sem redirecionamentos nem retentativas automáticas
  que possam duplicar mensagens após uma resposta incerta.
- O link abre `/reset-password?token=…` no frontend configurado. O token aleatório
  expira em 30 minutos; apenas o hash é persistido e o uso é único. Um novo pedido
  invalida os tokens anteriores. O envio ocorre depois do commit da transação.
- Contas `ACTIVE` e `PENDING_APPROVAL` não eliminadas podem recuperar a senha.
  A resposta pública permanece genérica para contas desconhecidas, desativadas
  e falhas de entrega. Falhas são registadas sem chave, destinatário, token,
  conteúdo da mensagem ou resposta do provedor. Após falha, pode pedir novo link.

## Notificações por email

Com a mesma chave e remetente configurados, selecione **E-mail** no campo Canal
da tela Notificações. O canal é registado apenas quando há chave configurada;
sem ela, o envio imediato é recusado antes de criar registos.

As permissões `NOTIFICATION_SEND` e o escopo dos destinatários continuam a ser
exigidos. Os públicos existentes (membros, visitantes, grupos, ministérios,
perfis e todos os membros ativos) são preservados. Cada registo gera um email
individual; os endereços dos outros destinatários não são incluídos.

O endereço é consultado no servidor durante o envio. Membros devem estar ativos
e não anonimizados. Visitantes convertidos usam o endereço atual do membro
vinculado, também ativo e não anonimizado. Email ausente, inválido ou fictício
(`sememail+…`) resulta em `FAILED` sem chamar a Bird. Mensagens livres usam a
categoria `marketing` para respeitar as supressões, incluindo cancelamentos de
subscrição na Bird. O assunto vazio usa `Notificação — Igreja Ponte`; o conteúdo
é texto simples, com HTML escapado e quebras de linha preservadas.

`SENT`/Enviado significa aceitação pela Bird (`202`), não confirmação de entrega.
Falhas ficam `FAILED` com erro genérico no histórico; um envio coletivo pode
retornar `PARTIAL`. Não há retentativa automática. O registo é bloqueado durante
o envio para evitar processamento simultâneo. `Idempotency-Key` usa o ID da
notificação; a Bird protege repetições com pedido idêntico por aproximadamente
três horas. Essa proteção não garante deduplicação após a janela do provedor.

Agendamentos continuam `PENDING` até à ação explícita **Enviar**, disponível
depois da data agendada. Não há worker de envio automático. Pendentes antigos
não são enviados apenas por configurar a Bird. Cancelamento e proteção contra
segundo envio de registos processados mantêm-se.

## Verificação

Os testes locais simulam a Bird e a persistência: verificam o contrato HTTP,
conteúdo do link, validação de configuração, falhas, privacidade da resposta,
armazenamento apenas do hash, destinatários das notificações, permissões,
agendamentos e contrato de envio da Bird. Não enviam emails reais.

Para validar a entrega depois de configurar o segredo e publicar, peça a
recuperação de senha de uma conta de teste autorizada, confirme a aceitação e
entrega na Bird e use o link recebido. Confirme também a expiração e a rejeição
de um segundo uso do mesmo link.

Referências: [API de envio](https://bird.com/docs/api/reference/create-email-message)
e [autenticação e região](https://bird.com/docs/guides/authentication),
[idempotência](https://bird.com/docs/api/idempotency).
