# Sugestões de categoria e centro de custo

Na revisão de movimentos bancários, a aplicação consulta o histórico e oferece
botões separados para usar a categoria e o centro de custo sugeridos. Nenhum campo
é substituído automaticamente. A escolha só é persistida ao salvar o movimento,
pelo fluxo existente de classificação, com as mesmas validações e auditoria.

`GET /finance/banking/transactions/:id/classification-suggestions` exige
`FINANCE_BANK_IMPORT`, `FINANCE_CONTRIBUTION_READ` e `FINANCE_CATEGORY_READ`.
Retorna `{ classification, category, costCenter }`. Cada sugestão contém `id`,
`name`, `agreement` (percentual de concordância), `support` e `sampleSize`;
campos sem evidência suficiente retornam `null`. O endpoint de sugestões de
membros mantém seu contrato existente.

São consultados até 2.000 movimentos mais recentes da mesma conta e direção,
em importações confirmadas ou prontas para revisão. Só entram registros
classificados por um usuário, com status `CLASSIFIED` ou `RECONCILED` e tipo
compatível com a direção. O próprio movimento é excluído, assim como ignorados,
duplicados pendentes e registros ainda não classificados por um usuário.

A comparação usa a descrição original do extrato, normalizando acentos,
maiúsculas, pontuação e datas completas (`AAAA-MM-DD`, `AAAA/MM/DD`,
`DD-MM-AAAA`, `DD/MM/AAAA` ou `DD.MM.AAAA`). Outros números e identificadores
são preservados. Exige-se uma descrição normalizada com pelo menos cinco
caracteres e correspondência exata com o padrão normalizado; descrições diferentes
não são aproximadas. A descrição editada na revisão não altera essa comparação.

Categoria e centro de custo são avaliados independentemente: a opção mais comum
precisa aparecer em pelo menos três movimentos e representar pelo menos 80% do
histórico correspondente. Valores ausentes, categorias incompatíveis e “Sem
categoria” contam contra a concordância. O percentual expressa concordância
observada no histórico, não uma probabilidade garantida de acerto. Não há serviço
externo de IA nem migração de banco. Novas confirmações e correções passam a
compor o histórico das próximas consultas; as sugestões não salvam dados sozinhas.
