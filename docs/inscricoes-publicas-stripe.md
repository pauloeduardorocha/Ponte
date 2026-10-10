# Inscrições públicas e Stripe

Cada evento tem uma página `/events/<id>/register`. Publique o evento para abrir a página. Marque "Evento pago" e crie lotes na gestão do evento, com preço em EUR, quantidade e período de venda. Eventos gratuitos podem ter lotes gratuitos ou usar apenas a capacidade geral.

Membros entram com a conta associada a um membro ativo. Nome, email e telefone são preenchidos pelo servidor e a inscrição é vinculada ao membro. Visitantes informam nome, telefone e email; um cadastro de visitante é criado automaticamente. Emails informados publicamente não dão acesso a cadastros anteriores. A opção de comunicações é guardada na inscrição e respeitada no envio do evento. O gestor com EVENT_REGISTRATION_MANAGE pode cadastrar um visitante diretamente na inscrição, sem VISITOR_CREATE, somente nos eventos que pode gerir.

## Ativação

1. Aplicar a migração com `npm run db:deploy --workspace @church/api` no ambiente escolhido.
2. Configurar no servidor `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `PUBLIC_WEB_URL` (origem pública do frontend, HTTPS em produção). Nunca colocar a chave secreta em variáveis VITE.
3. Habilitar cartões e MB WAY no painel Stripe. O Checkout usa métodos dinâmicos e preços em EUR; a Stripe apresenta os métodos habilitados e elegíveis.
4. Criar um webhook Snapshot em `/api/v1/stripe/webhook`, para `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired` e `checkout.session.async_payment_failed`.
5. Usar primeiro credenciais de teste. No Stripe CLI: `stripe listen --forward-to localhost:3000/api/v1/stripe/webhook`. Copiar o segredo whsec fornecido para STRIPE_WEBHOOK_SECRET.

O pagamento abre no Stripe Checkout hospedado; não é necessária uma chave publicável no frontend. Vagas são reservadas por 35 minutos. Só webhooks com assinatura válida confirmam a inscrição, verificando moeda, montante, sessão e inscrição. Eventos repetidos não duplicam confirmação. Sessões expiradas ou falhadas cancelam a reserva. Pagamentos recebidos após cancelamento, troca da reserva ou esgotamento são devolvidos automaticamente com chave de idempotência. O redirecionamento após compra consulta o estado do pagamento no servidor.

O formulário do gestor devolve um link de pagamento para encaminhar à pessoa. O fluxo de reembolsos administrativos já existente continua como solicitação/aprovação; a sua execução no gateway não faz parte desta compra.

## Verificação de aceitação no ambiente de teste

- Evento gratuito publicado: inscrição pública cria visitante e inscrição; sem chave Stripe continua funcionando.
- Evento pago: escolher lote, pagar com cartão de teste, verificar confirmação e contador de vagas.
- MB WAY: usar +351911111112 para sucesso e +351911111113 para falha em sandbox.
- Última vaga: enviar compras simultâneas e verificar que só uma reserva é criada.
- Reenviar webhook e verificar que os contadores permanecem iguais.
- Cancelar pagamento e aguardar expiração; verificar liberação da vaga.
- Gestor sem permissão de visitantes consegue cadastrar visitante na inscrição; outro gestor não consegue operar evento alheio.

Referências: https://docs.stripe.com/payments/mb-way/accept-a-payment?payment-ui=checkout e https://docs.stripe.com/webhooks.
