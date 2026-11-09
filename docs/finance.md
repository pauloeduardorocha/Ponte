# Financeiro, importação e relatórios

O menu **Financeiro** inclui resumo, receitas, despesas, categorias, contas,
fornecedores, contribuições e documentos privados de despesas. A migration
`20261007120000_finance` adiciona as entidades, permissões e a hierarquia inicial
Receitas (Dízimos, Ofertas, Doações, Eventos) e Despesas (Pessoal, Aluguel, Energia,
Água, Internet, Manutenção, Eventos). A role FINANCE recebe as permissões
financeiras e SUPER_ADMIN recebe os novos códigos; contas ativas recebem apenas o resumo agregado por `FINANCE_SUMMARY_READ`,
sem conceder gestão financeira. Acesso administrativo depende das permissões. O seed inclui `financeiro@ponte.example`,
com a senha local explicitamente configurada, para demonstração.

## API financeira

Prefixo `/api/v1/finance`, autenticação Bearer e autorização por requisição.

| Recurso                     | Operações                            | Permissões                                                                 |
| --------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| `/categories`               | GET, POST, PATCH `/:id`              | FINANCE_CATEGORY_READ / WRITE                                              |
| `/accounts`                 | GET, POST, PATCH `/:id`              | FINANCE_ACCOUNT_READ / WRITE                                               |
| `/suppliers`                | GET, POST, PATCH `/:id`              | FINANCE_SUPPLIER_READ / WRITE                                              |
| `/incomes`, `/expenses`     | GET, POST, PATCH `/:id`              | FINANCE_TRANSACTION_READ / CREATE / UPDATE                                 |
| `/contributions`            | GET, POST, PATCH `/:id`              | FINANCE_CONTRIBUTION_READ; escrita também exige FINANCE_CONTRIBUTION_WRITE |
| `/dashboard`                | GET                                  | FINANCE_DASHBOARD_READ ou FINANCE_SUMMARY_READ, com projeções diferentes   |
| `/expenses/:id/attachments` | GET, POST multipart com campo `file` | FINANCE_ATTACHMENT_READ / WRITE                                            |
| `/attachments/:id/download` | GET                                  | FINANCE_ATTACHMENT_READ                                                    |

Listagens usam `{items,total,page,pageSize}`, página padrão 1, tamanho padrão 20,
máximo 100; cadastros permitem pesquisa por nome. Receitas/despesas aceitam
`accountId` e `status`. PATCH preserva campos omitidos; null limpa opcionais.
DTOs rejeitam campos desconhecidos, inclusive qualquer credencial bancária.
Lançamentos são cancelados com CANCELLED. Contas podem ser inativadas;
`DELETE /finance/accounts/:id` exige FINANCE_ACCOUNT_WRITE e as validações
do serviço impedem remover contas com histórico vinculado.

- Categoria: `name`, `kind` INCOME/EXPENSE, `parentId` opcional. Tipo imutável;
  pais devem ter o mesmo tipo e ciclos são rejeitados.
- Conta: `bank`, `name`, `branch`, `account`, `iban`, `currency` ISO 4217,
  `openingBalance` decimal, `status` ACTIVE/INACTIVE. Moeda e saldo inicial
  ficam bloqueados após a primeira movimentação/importação.
- Fornecedor: `name`, `taxId`, `email`, `phone`.
- Receita: `amount`, `date`, `categoryId`, `accountId`, `description`, `origin`,
  `memberId` opcional, `costCenterId` (ou texto legado `costCenter`), `reference`, `status`, `bankTransactionId`
  opcional. Vincular origem bancária exige FINANCE_RECONCILE; valor, data e
  conta devem coincidir com a transação bancária.
- Despesa: `amount`, `date`, `dueDate`, `paidAt`, `categoryId`, `supplierId`
  opcional, `accountId`, `costCenterId` (ou texto legado `costCenter`), `description`, `document`, `status`.
  COMPLETED exige `paidAt`; PENDING/CANCELLED exigem ausência de pagamento.
- Contribuição: `incomeId` único, `memberId` e `type`
  TITHE/OFFERING/DONATION/OTHER. Receita e membro são imutáveis após o vínculo;
  a associação atualiza também o membro da receita e é auditada atomicamente.

Valores positivos em DECIMAL(14,2), entradas e saídas como strings decimais,
sem floats ou câmbio. Datas são `YYYY-MM-DD`; mês do dashboard é UTC.
O resumo separa totais por moeda: receitas/despesas COMPLETED do mês pela data
do lançamento, saldo inicial + receitas concluídas até hoje - despesas pagas
até hoje, pendências de todas as datas, dízimos e ofertas concluídos do mês e
as dez últimas transações. Contas inativas continuam compondo o histórico.

FINANCE_CONTRIBUTION_READ protege os vínculos e os detalhes identificadores
em receitas, dashboard e respostas de alterações. Sem essa permissão,
receitas vinculadas exibem somente ID, valor, data, categoria, conta, status e
uma descrição genérica. Os indicadores de dízimos/ofertas são omitidos.
Alterar receitas vinculadas exige essa permissão adicional. MEMBER_READ não
concede acesso financeiro ou acesso às contribuições.

`Contribution → Income → BankTransaction → BankImport → storageKey/filename`
preserva a origem. A listagem de contribuições autorizada inclui a transação
e os metadados do arquivo, sem expor a chave privada. O importador bancário abaixo já está implementado; não há endpoint público
para inserir origens arbitrárias.

## Arquivos privados e auditoria

No modo filesystem, StorageService grava arquivos com UUID aleatório fora da árvore pública,
com permissões restritas; nenhuma rota estática serve esse diretório.
`PRIVATE_STORAGE_PATH` configura o local. No Docker, o volume
`financial_storage` persiste `/app/private-storage` como usuário node.
Em Windows, configure também as ACLs da pasta para a conta do processo.
No modo database (obrigatório na Vercel), binários ficam em private_files.
Backups filesystem devem incluir banco e volume de documentos; ver [recuperação](backup-recovery.md). Múltiplas réplicas precisam
compartilhar storage ou usar outro adapter de StorageService.

Uploads limitados a 10 MB; somente PDF, JPEG e PNG com MIME, extensão e
assinatura compatíveis. A API rejeita outros formatos e campos multipart.
Download autenticado usa `Content-Disposition: attachment`, `no-store` e
`nosniff`; os arquivos nunca recebem URL pública. A interface envia o token
em memória ao enviar/baixar documentos.

Cada criação/alteração e vínculo financeiro grava AuditLog na mesma transação.
Falha de auditoria reverte a alteração; arquivo recém-enviado é removido se a
transação falhar. Downloads também são auditados. Um advisory lock PostgreSQL
serializa mutações financeiras, incluindo validação de hierarquia e vínculos.
As suites HTTP usam schemas aleatórios e diretórios temporários exclusivos;
TEST_DATABASE_URL é obrigatório para biblioteca e financeiro.

## Importação bancária

Em **Financeiro → Importação bancária**, escolha a conta e um CSV, XLSX ou OFX
(até 10 MB e 10000 movimentos), e clique em **Importar extrato**. Os movimentos
válidos cadastram receitas e despesas concluídas automaticamente, com a categoria
**Sem categoria**. O arquivo original e os vínculos são preservados. A tela mostra
os movimentos importados; **Histórico de importações** abre os arquivos anteriores.

Categorias podem ser escolhidas na própria linha, em grupos de movimentos da
mesma direção, ou posteriormente nas listas de **Receitas** e **Despesas**.
A edição mantém a categoria do movimento e do registro financeiro sincronizadas.
O formulário detalhado permite associar membros, contribuições e fornecedores.
Sugestões de membros exigem uma escolha explícita; nunca criam uma contribuição
apenas por reconhecer um nome na descrição.

Duplicidades são tratadas conforme [a regra atual](bank-import-duplicates.md):
linhas distintas do mesmo extrato são preservadas; ocorrências já importadas
em outro arquivo ficam rejeitadas e não são liberadas por acceptDuplicate.
Possíveis correspondências com lançamentos manuais continuam sujeitas à
associação explícita, sem contabilizar duas vezes o mesmo pagamento.
O processamento e a criação dos lançamentos são atômicos e usam o mesmo lock
transacional das mutações financeiras. Falhas preservam o original, mostram o
motivo e não deixam lançamentos parciais.

CSV aceita UTF-8/Windows-1252, vírgula, ponto e vírgula ou tabulação e cabeçalhos
em português/inglês. XLSX reconhece introduções e as variações Millennium com ou
sem saldo; fórmulas são rejeitadas e o ZIP é limitado a 40 MB. OFX aceita SGML/XML.
Conta e moeda identificadas no arquivo devem corresponder ao cadastro. Dinheiro
usa Decimal; datas ambíguas não são inferidas. Valor, data, conta e pagamento
vindos do extrato são preservados; categoria, descrição e associações podem ser
editadas conforme as permissões financeiras.

Após importar, a tela pergunta se deseja **Buscar faturas no e-Fatura**. Informe
NIF e senha das Finanças; o serviço consulta o período completo do extrato e
importa o resultado diretamente, sem exportar ou carregar JSON. A senha passa
por um canal IPC privado para o processo de consulta, não é gravada em arquivos,
argumentos de linha de comando, banco ou logs. A consulta tem limite de dois
minutos e uma execução por instância da API. Se houver MFA/CAPTCHA, falha de
login ou indisponibilidade do portal, a tela informa o problema e o extrato
continua cadastrado. É possível tentar novamente pelo botão de busca.

Faturas são associadas à **despesa**, inclusive quando ela tem origem bancária.
A associação exige escolha explícita; veja [e-Fatura](EFATURA.md).
A origem e os registros financeiros podem ser consultados nos detalhes do movimento.

Upload, consulta e download exigem FINANCE_BANK_IMPORT e FINANCE_CONTRIBUTION_READ.
A consulta ao e-Fatura também exige FINANCE_INVOICE_READ e FINANCE_INVOICE_IMPORT;
associação de documentos exige FINANCE_INVOICE_ASSOCIATE. Associar contribuições
exige FINANCE_CONTRIBUTION_WRITE.

Principais endpoints sob /api/v1/finance:

| Endpoint                                      | Operação                                                       |
| --------------------------------------------- | -------------------------------------------------------------- |
| POST /banking/imports                         | Extrato multipart com accountId e file; cadastro automático    |
| GET /banking/imports, /banking/imports/:id    | Histórico e detalhe                                            |
| GET /banking/imports/:id/download             | Download privado do original                                   |
| GET /banking/transactions                     | Movimentos, filtros e paginação                                |
| POST /banking/transactions/:id/link           | Vincular a receita/despesa existente com confirmação explícita |
| POST /banking/classify                        | Categoria opcional, associações e revisão de duplicados        |
| GET /banking/transactions/:id/suggestions     | Sugestões de membros                                           |
| POST /invoices/fetch                          | bankImportId, nif e password; consulta direta ao portal        |
| GET /invoices/expense-suggestions/:expenseId  | Sugestões de faturas para a despesa                            |
| POST/DELETE /invoices/:id/expense-association | Associar ou remover vínculo com despesa                        |

A tela não possui uma etapa de conciliação. BankReconciliation permanece como
estrutura interna de integridade e histórico; os endpoints legados de confirmar,
vincular e desfazer continuam disponíveis para compatibilidade, com as permissões
originais. Nenhuma migração adicional de banco é necessária para este fluxo;
as duas categorias **Sem categoria** são criadas no primeiro uso.

## Relatórios financeiros

Em **Financeiro → Relatórios**, escolha o relatório, o período e os filtros e clique em **Gerar relatório**. Há receitas/despesas por período e categoria, fluxo de caixa, saldo por conta, dízimos/ofertas/doações, contribuições por membro, despesas por fornecedor, movimentos bancários não conciliados e evolução mensal.

Os valores usam Decimal e são separados por moeda. O padrão é considerar lançamentos COMPLETED; relatórios de lançamentos também permitem PENDING e CANCELLED. O fluxo de caixa e saldo utilizam a data do lançamento para receitas e a data de pagamento para despesas, sempre concluídas. Saldo inicial do período = saldo inicial cadastrado na conta + receitas anteriores − pagamentos anteriores. Os valores anteriores e o saldo cadastrado têm links próprios. Saldo por conta aceita conta/período; os demais filtros são oferecidos conforme o tipo de relatório. Status bancário é separado do status dos lançamentos. Centro de custo ainda não se aplica a movimentos não conciliados.

Cada linha aponta para Income/Expense ou BankTransaction; as origens bancárias preservam BankImport e o arquivo original, e contribuições apontam para Contribution. Grupos incluem os IDs de suas linhas de origem. Relatórios e exportações usam uma leitura consistente do banco. Há limite de 10.000 registros/fontes por relatório: refine filtros quando necessário; não há truncamento silencioso. Pesquise os filtros de conta, categoria, membro e fornecedor pelo nome (até 100 resultados por pesquisa).

CSV e XLSX incluem identificação, período, filtros, linhas, totais, grupos e IDs de origem. CSV neutraliza células que poderiam ser interpretadas como fórmulas; XLSX usa valores textuais explícitos. PDF está disponível para o relatório individual de contribuições, com membro obrigatório, igreja, período, tipos, valores, origens, referências, totais e observações. É apoio à preparação de informações fiscais, não uma declaração fiscal oficial e não substitui contabilista. A identificação da igreja pode ser informada na tela ou configurada em CHURCH_NAME, CHURCH_TAX_ID e CHURCH_ADDRESS.

API: GET `/api/v1/finance/reports?report=incomes&start=2026-01-01&end=2026-01-31`; exportação em `/api/v1/finance/reports/export` com os mesmos filtros e `format=csv|xlsx|pdf`. Os filtros são `accountId`, `categoryId`, `memberId`, `supplierId`, `costCenter`, `status`, `bankStatus` e `contributionType` quando aplicáveis. Tipos: `incomes`, `expenses`, `cash-flow`, `account-balances`, `income-categories`, `expense-categories`, `tithes`, `offerings`, `donations`, `member-contributions`, `supplier-expenses`, `unreconciled`, `monthly-evolution`, `contribution-statement`.

FINANCE_TRANSACTION_READ permite relatórios gerais; FINANCE_CONTRIBUTION_READ é obrigatório para dados de membros, filtros por membro/tipo e extratos. FINANCE_BANK_IMPORT também é obrigatório para não conciliados. FINANCE_CONTRIBUTION_EXPORT é obrigatório para exportações de contribuições/membros e de extratos; exportações gerais sem essa permissão omitem identidade, descrição, referência e origem de receitas que possam identificar membros. Cada exportação registra FINANCE_REPORT_EXPORT em AuditLog (usuário, horário, relatório, filtros, formato e quantidade de registros). Se o registro de auditoria falhar, o arquivo não é entregue. Não existem links públicos de exportação; downloads exigem sessão e usam no-store.

## Guias relacionados

[Dashboard e projeção](treasury-dashboard.md), [reembolsos](reimbursements.md),
[sugestões de classificação](bank-classification-suggestions.md) e
[contrato OpenAPI](openapi.json). Centros de custo possuem cadastro próprio em
`/finance/cost-centers`, com leitura/escrita pelas permissões de categoria.
O dashboard aceita FINANCE_DASHBOARD_READ ou FINANCE_SUMMARY_READ; o segundo
retorna somente o resumo seguro e recusa filtros administrativos por conta.
