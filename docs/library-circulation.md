# Circulação e multas da biblioteca

Regras implementadas em `library.service.ts` e `library.policy.ts`. Catálogo,
paginação e histórico estão em [library-pagination.md](library-pagination.md);
a estrutura está em [library-data-model.md](library-data-model.md). Configurações
são editáveis: os defaults abaixo não comprovam os valores de produção.

## Circulação, tempo e carência

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

## Fila e expiração

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
- Uma rotina a cada hora e a sincronização antes de toda operação
  mantêm atrasos, multas e expirações. Sem API em execução, convergem na próxima
  chamada ou execução do timer. Falhas periódicas são registradas explicitamente.
  A identificação do próximo membro está na reserva READY; o sistema tenta
  [Web Push](notifications.md) para reservas prontas e empréstimos em atraso.
  Instâncias serverless suspensas não garantem a execução do timer.

## Dinheiro e auditoria

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
