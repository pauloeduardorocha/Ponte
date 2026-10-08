# Faturas do e-fatura e movimentos bancários

Em **Financeiro → Importação bancária**, importe o extrato e responda à pergunta
**Buscar faturas deste extrato?**. Informe NIF e senha das Finanças ou escolha
**Agora não**. O serviço usa todas as datas do extrato, independentemente da
página/filtros, autentica no portal e importa as faturas diretamente. A senha
não é armazenada: passa por IPC privado ao scraper, fora de arquivos, argumentos
de comando e logs. Se o portal exigir MFA/CAPTCHA, a consulta pode falhar; a tela
informa o problema e as receitas/despesas do extrato continuam cadastradas.

A API inclui o scraper e Chromium na imagem Docker. Para desenvolvimento local:

`npm ci --prefix apps/scrapper`

Use PUPPETEER_EXECUTABLE_PATH para apontar a um Chromium já instalado. Ajuste
EFATURA_FILTER_SUBMIT/EFATURA_COLUMNS quando os seletores/cabeçalhos do portal
mudarem. Em modo integrado, a ausência de um botão para aplicar os filtros
interrompe a consulta, em vez de aguardar uma intervenção no terminal.

## Exportação independente (opcional)

O comando local continua disponível com login manual em navegador visível,
incluindo MFA/CAPTCHA. Um arquivo de configuração pode conter
`{"period":{"start":"2026-08-01","end":"2026-10-07"}}`.

```powershell
cd apps/scrapper
npm ci
$env:EFATURA_RECIPIENT_NIF = 'NIF_DO_TITULAR'
npm start -- --config 'C:\caminho\efatura-config.json'
```

Também pode definir `$env:EFATURA_START = '2026-08-01'` e `$env:EFATURA_END = '2026-10-07'`. Essas datas substituem as do arquivo de configuração, permitindo ampliar o período para pagamentos posteriores à emissão. Datas ausentes, inválidas ou invertidas interrompem a execução antes de abrir o navegador.

O scraper preenche `#dataInicioFilter` e `#dataFimFilter`, dispara eventos de alteração e aplica o formulário. Se o portal usar um botão específico, configure `$env:EFATURA_FILTER_SUBMIT` com o seletor CSS desse botão. Sem botão de submissão identificável, aplique a pesquisa no navegador e pressione Enter no terminal. O exportador espera a rede ficar ociosa e verifica as datas extraídas; não grava um arquivo contendo faturas fora do intervalo.

## Colunas e links

A demo original tinha `campo1` a `campo6`, sem identificação semântica. O exportador identifica cabeçalhos conhecidos; se não conseguir mapear algum campo, interrompe a exportação e mostra os cabeçalhos para configuração explícita. **Não pressupõe a ordem das colunas.** Exemplo ilustrativo, ajuste aos cabeçalhos reais:

```powershell
$env:EFATURA_COLUMNS = '{"issuerName":0,"issuerTaxId":1,"number":2,"date":3,"amount":4,"documentUrl":2}'
```

Os índices começam em zero. O campo `documentUrl` identifica a coluna do link quando houver vários links numa linha. Links relativos são resolvidos pelo navegador. São aceitos links HTTPS dos hosts `faturas.portaldasfinancas.gov.pt` e `www.portaldasfinancas.gov.pt`; links com credenciais ou identificadores de sessão são excluídos. Links `javascript:` não são executados nem convertidos em URLs presumidas. Nesses casos, a associação continua disponível sem link até adaptar o extrator ao mecanismo real do portal.

Valores portugueses como `1.234,56 €` são normalizados para strings decimais `1234.56`. As datas são exportadas como `YYYY-MM-DD`. Notas de crédito usam valor negativo. Os arquivos não são sobrescritos: para outra execução, remova/mova o arquivo anterior ou configure `EFATURA_OUTPUT`.

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
node --test apps/scrapper/normalize.test.js
```

Os testes locais cobrem normalização, filtros, segurança de links/uploads, IPC e descarte de credenciais, duplicidades, RBAC, cadastro automático, categorização posterior e rastreabilidade. A autenticação e os seletores atuais do portal precisam ser verificados numa sessão real do titular; os testes não acessam a Autoridade Tributária.
