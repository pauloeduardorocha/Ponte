# Faturas do e-fatura e movimentos bancários

Em **Financeiro → Importação bancária**, importe o extrato e responda à pergunta
**Buscar faturas deste extrato?**. Informe NIF e senha das Finanças ou escolha
**Agora não**. O serviço usa todas as datas do extrato, independentemente da
página/filtros, autentica no portal e importa as faturas diretamente. A senha
não é armazenada: passa por IPC privado ao scraper, fora de arquivos, argumentos
de comando e logs. Se o portal exigir MFA/CAPTCHA, a consulta pode falhar; a tela
informa o problema e as receitas/despesas do extrato continuam cadastradas.

O scraper pertence à API em `apps/api/src/modules/banking/efatura`.
O build Nest copia os módulos do processo isolado para `dist`; a API resolve
esse processo em relação ao próprio módulo, sem depender do diretório de execução.
Não existe mais um aplicativo ou exportador independente.

As dependências `puppeteer-core` e `@sparticuz/chromium` são instaladas com
`npm ci` na raiz. Na Vercel/Linux, o Chromium empacotado é extraído em
`/tmp`. A configuração do deploy inclui os módulos e binários e permite
180 segundos de execução; a consulta tem timeout interno de 120 segundos.
Na imagem Docker, utiliza-se o Chromium instalado pelo sistema.

No desenvolvimento em Windows/macOS ou para usar outro Chromium, configure
`PUPPETEER_EXECUTABLE_PATH` com o caminho do executável. O navegador roda
sem interface. MFA/CAPTCHA ainda podem impedir a autenticação automática.

O período vem das datas mínima e máxima do extrato. O scraper preenche
`#dataInicioFilter` e `#dataFimFilter`, aplica a pesquisa e valida as datas
em todas as páginas. Configure `EFATURA_FILTER_SUBMIT` se o portal exigir
um seletor específico. A ausência de botão de pesquisa interrompe a consulta.
A página inicia uma pesquisa AJAX automaticamente. O scraper aguarda a conclusão
dessa primeira pesquisa antes de preencher outro período e, depois do clique,
aguarda o portal voltar a mostrar `.searchResults` ou `.noSearchResults`, que
só são exibidos pelo callback após atualizar a tabela. A espera não depende da
ociosidade de toda a rede, pois pedidos de fundo podem continuar ativos.
Resultados vazios não reutilizam linhas ocultas da pesquisa anterior.
Layouts legados sem esses painéis mantêm a espera por ociosidade da rede.
O formato ISO é o esperado pelo datepicker do portal (`yyyy-mm-dd`).
As respostas HTTP da pesquisa são monitorizadas desde a abertura da página:
HTTP 429 interrompe a consulta com `PORTAL_RATE_LIMITED` e pede ao utilizador
para aguardar; outras respostas HTTP de erro usam `PORTAL_HTTP_ERROR`.
Não são feitas tentativas automáticas. O portal pode manter os dois painéis
ocultos depois de um erro HTTP, por isso estes erros são tratados antes de
esperar pela atualização dos resultados. Não se registam os corpos das respostas.

Os logs registram somente o código de falha e a etapa (inicialização, login,
filtros ou extração), sem senha, NIF, dados das faturas ou URLs de sessão.
Falhas de extração incluem também a operação que falhou (por exemplo,
`read_rows`, `advance_page` ou `wait_next_page`). Códigos específicos distinguem
configuração de colunas inválida (`INVOICE_MAPPING_INVALID`), faturas fora do
período (`INVOICE_OUTSIDE_PERIOD`), página repetida (`INVOICE_PAGE_REPEATED`) e
limite de faturas (`INVOICE_LIMIT_EXCEEDED`). Operações e códigos são validados
por uma lista fechada na API; mensagens e stacks do portal não são registradas.
O código `PORTAL_ERROR` de versões anteriores não permite recuperar a causa
original: nesses casos é necessário repetir a consulta com este diagnóstico.

## Diagnóstico local dos filtros

Execute na raiz do repositório (substitua o período pelo do extrato):

```powershell
node apps/api/scripts/diagnose-efatura.cjs --start=2026-10-12 --end=2026-10-27
```

O comando abre um Chrome/Edge separado, com interface, e aguarda até dez minutos
pelo login manual nas Finanças. Não passe NIF ou senha pela linha de comando.
No Windows, encontra Chrome/Edge nos caminhos padrão; para outro local/sistema,
configure `PUPPETEER_EXECUTABLE_PATH`. O teste reutiliza `applyDateFilters` da
consulta de produção, percorre as páginas e não importa dados para a API.

O terminal registra `before_filters`, os parâmetros de data reconhecidos em
`filter_request_dates` e `after_filters` para cada página. Compare as datas
aceites pelos campos, `earliest`/`latest` e `outsidePeriod`. Campos preenchidos
corretamente não comprovam que o servidor aplicou o filtro. Parâmetros ausentes
do diagnóstico também não comprovam que não foram enviados: o diagnóstico só
reconhece nomes de parâmetros de data específicos em query/form URL-encoded.
Não registra pedidos completos, cookies, credenciais, emitentes ou documentos.
Depois de `diagnostic_complete`, o navegador fica aberto para conferência;
feche-o para encerrar o comando. O teste altera os filtros e a página atual do
portal, sem modificar faturas.
Os comandos `inspect`, `apply` e `close` no terminal permitem observar de novo,
repetir a pesquisa e fechar o navegador. Mesmo após erro, a janela continua
aberta para inspeção. Um timeout em `filter_wait_timeout` é seguido pela leitura
dos campos/tabela para distinguir uma pesquisa concluída de tráfego de fundo.

## Colunas e links

O scraper identifica cabeçalhos conhecidos; se não conseguir mapear algum campo, interrompe a consulta. Configure EFATURA_COLUMNS para adaptar o mapeamento aos cabeçalhos reais. **Não pressupõe a ordem das colunas.** Exemplo ilustrativo, ajuste aos cabeçalhos reais:

```powershell
$env:EFATURA_COLUMNS = '{"issuerName":0,"issuerTaxId":1,"number":2,"date":3,"amount":4,"documentUrl":2}'
```

Os índices começam em zero. O campo `documentUrl` identifica a coluna do link quando houver vários links numa linha. Links relativos são resolvidos pelo navegador. São aceitos links HTTPS dos hosts `faturas.portaldasfinancas.gov.pt` e `www.portaldasfinancas.gov.pt`; links com credenciais ou identificadores de sessão são excluídos. Links `javascript:` não são executados nem convertidos em URLs presumidas. Nesses casos, a associação continua disponível sem link até adaptar o extrator ao mecanismo real do portal.

Valores portugueses como `1.234,56 €` são normalizados para strings decimais `1234.56`. As datas são exportadas como `YYYY-MM-DD`. Notas de crédito usam valor negativo. O resultado é enviado por IPC e importado pela API, sem gravar arquivos locais.

## Importação e associação

A busca integrada importa o resultado automaticamente. O endpoint legado POST `/api/v1/finance/invoices/imports` continua aceitando `faturas.json` via multipart para integrações independentes. O arquivo original é privado, com limite de 10 MB, extensão/MIME validados e acesso autenticado. A importação preserva emitente, NIF do emitente e do titular, número, data, valor Decimal, moeda e link do documento. Reimportações idênticas não duplicam a fatura: a identidade inclui NIFs, número, data, valor e moeda; o primeiro arquivo permanece como origem do documento.

Em cada movimento, **Associar fatura** mostra candidatos com valor/moeda iguais e data entre 90 dias antes e 7 dias depois do movimento. A referência/NIF e o nome do emitente aumentam a compatibilidade. Os percentuais são uma pontuação heurística, não uma probabilidade estatística. Nenhum candidato é associado automaticamente. Pesquise por emitente, NIF ou número para escolher outros documentos.

Uma transação pode ter várias faturas. Cada fatura tem um movimento associado; pagamentos parciais em vários movimentos ainda não são suportados. A escolha manual aceita valores diferentes (por exemplo, pagamento agrupado), mas exige moeda e direção compatíveis. Notas de crédito podem ser associadas a movimentos de crédito. Categoria e fornecedor podem ser alterados depois; não há etapa de confirmação ou conciliação na tela.

Fluxo de rastreabilidade: **JSON original → InvoiceImport → FinancialInvoice → BankTransaction → BankImport/arquivo bancário e Income/Expense**. Desfazer a conciliação conserva a associação documental e o histórico. Remover uma associação gera auditoria com valores anteriores e novos.

**Abrir fatura no portal** abre o link capturado em nova aba, podendo exigir autenticação. Esse link não equivale a um PDF arquivado: a consulta extrai dados e links, sem arquivar automaticamente o PDF. Para arquivar o PDF, utilize o upload privado de anexos da despesa.

## Permissões e operação

- `FINANCE_INVOICE_READ`: consultar faturas e baixar o JSON original.
- `FINANCE_INVOICE_IMPORT`: importar faturas, junto com leitura.
- `FINANCE_INVOICE_ASSOCIATE`: associar/remover vínculos, junto com leitura e permissões de importação bancária/contribuições exigidas pela revisão bancária.

A migration atribui essas permissões a `FINANCE` e `SUPER_ADMIN`. Após aplicar migrations, entre novamente ou renove a sessão. Não há endpoint de exclusão de faturas/importações. Uploads, associações, remoções e downloads são auditados, incluindo usuário, IP e user-agent. Em produção, reaplique `apps/api/prisma/runtime-privileges.sql` depois das migrations para disponibilizar as novas tabelas ao papel de execução restrito.

```bash
npm run lint
npm run test
npm run build
npm run test:efatura --workspace @church/api
```

Os testes locais cobrem normalização, filtros, segurança de links/uploads, IPC e descarte de credenciais, duplicidades, RBAC, cadastro automático, categorização posterior e rastreabilidade. A autenticação e os seletores atuais do portal precisam ser verificados numa sessão real do titular; os testes não acessam a Autoridade Tributária.
