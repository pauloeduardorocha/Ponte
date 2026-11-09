# Dashboard da tesouraria

Na página Financeiro → Dashboard (`/finance/dashboard`), o acesso exige
`FINANCE_TRANSACTION_READ`. Leitores apenas de resumo continuam a ver o resumo
existente. A API `GET /api/v1/finance/charts?start=YYYY-MM-DD&end=YYYY-MM-DD`
exige a mesma permissão e retorna somente agregados, sem dados pessoais.

O intervalo inclusivo filtra quatro pizzas: receitas e despesas por categoria
e por centro de custos. Centros ausentes aparecem como “Sem centro de custos”.
O gráfico de linhas apresenta saldo acumulado, receitas e despesas diárias.
Ele possui um campo próprio de data fim para projeção independente das pizzas;
alterar o intervalo geral reinicia esse campo. A tesouraria e seu Resumo permanecem na página `/finance`, sem aba de Dashboard.
O endereço antigo `/finance?tab=dashboard` redireciona para a nova página.

Os gráficos usam Recharts, carregado sob demanda somente nessa rota: animações
(respeitando a preferência por movimento reduzido), tooltips com valores e
percentuais nas pizzas, tooltips diários nas linhas, controles para mostrar/ocultar
séries e faixa de seleção para ampliar o período. A tabela de valores continua
disponível para leitura acessível.
Cada moeda tem seus próprios gráficos; valores de moedas diferentes não são somados.

São considerados lançamentos COMPLETED: receitas pela data e despesas por paidAt.
Despesas sem pagamento e lançamentos pendentes/cancelados não participam.
O saldo parte da soma dos saldos iniciais das contas e inclui todos os movimentos
concluídos anteriores ao início. Contas inativas também entram no histórico.
É o saldo contábil calculado, não uma leitura direta do saldo fornecido pelo banco.

O início deve estar entre 2000-01-01 e hoje (UTC); fim deve ser igual ou posterior
ao início e o intervalo não pode exceder 1095 dias. O fim pode estar no futuro.
Nesse caso, a média diária usa os dias de calendário entre início e hoje,
incluindo dias sem movimento. Para cada dia futuro, são adicionadas as médias de
receitas e subtraídas as médias de despesas. As linhas futuras são tracejadas;
as pizzas continuam mostrando apenas movimentos realizados até hoje.
Sem movimentos, as médias são zero. A projeção é uma estimativa e não considera
compromissos pendentes, sazonalidade ou inflação. Os valores diários também estão
disponíveis em tabela expansível.

O contrato retorna `start`, `end`, `through` e `currencies`. Por moeda:
`initialBalance`, `averageIncome`, `averageExpenses`, `historicalDays`,
`incomeCategories`, `expenseCategories`, `incomeCenters`, `expenseCenters` e
`points` (`date`, `projected`, `income`, `expenses`, `balance`).
