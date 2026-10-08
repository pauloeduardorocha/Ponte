const puppeteer = require('puppeteer');

const { writeFile } = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const { validatePeriod, applyDateFilters } = require('./filters');
const { normalizeInvoices, safePortalLink } = require('./normalize');
const integrated = Boolean(process.send);

(async () => {
  const configArgument = process.argv.indexOf('--config');
  let config = integrated
    ? await new Promise((resolve) => process.once('message', resolve))
    : configArgument < 0
      ? {}
      : JSON.parse(
          readFileSync(process.argv[configArgument + 1], 'utf8').replace(
            /^\uFEFF/,
            '',
          ),
        );
  const period = validatePeriod(
    integrated
      ? config.period
      : {
          start: process.env.EFATURA_START || config.period?.start,
          end: process.env.EFATURA_END || config.period?.end,
        },
  );
  const recipientNif = config.nif || process.env.EFATURA_RECIPIENT_NIF;
  // headless: false permite ver o processo e intervir se houver um CAPTCHA inicial
  const browser = await puppeteer.launch({
    headless: integrated,
    ...(process.env.EFATURA_CHROMIUM_NO_SANDBOX === 'true'
      ? { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
      : {}),
    ...(process.env.PUPPETEER_EXECUTABLE_PATH
      ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
      : {}),
  });
  if (integrated)
    process.once('SIGTERM', async () => {
      await browser.close();
      process.exit(1);
    });
  const page = await browser.newPage();

  try {
    console.log('A aceder à página de autenticação oficial...');
    // Aceder diretamente ao URL de login que forneceu
    await page.goto(
      'https://www.acesso.gov.pt/jsp/loginRedirectForm.jsp?path=consultarDocumentosAdquirente.action&partID=EFPF',
      {
        waitUntil: 'networkidle2',
      },
    );

    // 0. Selecionar a tab "NIF"
    const botaoTipoLogin =
      '#login-form button[role="tab"][aria-controls$="-content-N"]';
    await page.waitForSelector(botaoTipoLogin, { visible: true });
    await page.click(botaoTipoLogin);

    // 1. Aguardar os campos com base no atributo 'name' (evitando IDs dinâmicos)
    console.log('A aguardar formulário de login...');
    await page.waitForSelector('input[name="username"]');
    await page.waitForSelector('input[name="password"]');

    if (integrated) {
      await page.type('input[name="username"]', config.nif);
      await page.type('input[name="password"]', config.password);
      config = { period, bankImportId: config.bankImportId };
      await page.click(
        '#login-form button[type="submit"], #login-form input[type="submit"]',
      );
    }

    console.log(
      'Conclua o login manualmente no navegador (incluindo MFA/CAPTCHA).',
    );
    await page.waitForFunction(
      () => location.hostname === 'faturas.portaldasfinancas.gov.pt',
      { timeout: integrated ? 30000 : 300000 },
    );
    await page.waitForNetworkIdle();

    // 4. Garantir que estamos na página correta da tabela de faturas
    console.log('A navegar para a tabela de faturas...');
    await page.goto(
      'https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action',
      {
        waitUntil: 'networkidle2',
      },
    );

    await applyDateFilters(page, period, process.env.EFATURA_FILTER_SUBMIT);
    console.log(`Extraindo apenas faturas de ${period.start} a ${period.end}`);
    // 5. Extração de dados da tabela (#documentos)
    const seletorLinhas = 'table#documentos tbody tr';
    const seletorProxima = '#documentos_paginate li.next:not(.disabled) a';
    await page.waitForSelector(seletorLinhas);

    const headers = await page.$$eval('table#documentos thead th', (cells) =>
      cells.map((cell) => cell.innerText.trim()),
    );
    const faturas = [];
    const paginas = new Set();
    const mapping = JSON.parse(process.env.EFATURA_COLUMNS || '{}');
    normalizeInvoices([], headers, recipientNif, mapping);

    while (true) {
      const faturasPagina = await page.evaluate((seletor) => {
        const linhas = Array.from(document.querySelectorAll(seletor));

        return linhas
          .map((linha) => {
            const colunas = linha.querySelectorAll('td');

            // Ignora linhas vazias ou de paginação
            if (colunas.length < 2) return null;

            return {
              cells: Array.from(colunas).map((cell) => cell.innerText.trim()),
              links: Array.from(colunas).flatMap((cell, column) =>
                Array.from(cell.querySelectorAll('a[href]')).map((link) => ({
                  column,
                  text: link.innerText.trim(),
                  url: link.href,
                })),
              ),
            };
          })
          .filter((f) => f !== null);
      }, seletorLinhas);
      const normalizedPage = normalizeInvoices(
        faturasPagina,
        headers,
        recipientNif,
        mapping,
      );
      if (
        normalizedPage.some(
          (invoice) => invoice.date < period.start || invoice.date > period.end,
        )
      )
        throw new Error(
          'Filtros nao aplicados: fatura fora do periodo; extracao interrompida nesta pagina.',
        );

      const signature = JSON.stringify(faturasPagina);
      if (paginas.has(signature))
        throw new Error(
          'Pagina repetida: exportacao interrompida para evitar duplicidades.',
        );
      paginas.add(signature);
      faturas.push(...faturasPagina);
      if (faturas.length > 10000)
        throw new Error('Limite de 10000 faturas. Reduza o periodo no portal.');

      const temProxima = await page.evaluate(() => {
        const proxima = document.querySelector('#documentos_paginate li.next');
        return Boolean(
          proxima &&
          !proxima.classList.contains('disabled') &&
          proxima.querySelector('a'),
        );
      });

      if (!temProxima) break;

      const estadoAnterior = await page.evaluateHandle(() => {
        const tabela = document.querySelector('table#documentos');
        const jquery = window.jQuery;
        const configuracoes =
          jquery?.fn?.dataTableSettings || jquery?.fn?.dataTable?.settings;
        const configuracao =
          configuracoes &&
          Array.from(configuracoes).find((item) => item.nTable === tabela);
        const estado = {
          primeiraLinha: tabela.querySelector('tbody tr'),
          linhas: tabela.querySelector('tbody').innerText,
          configuracao,
          inicio: configuracao?._iDisplayStart,
          redesenhou: false,
        };

        if (configuracao) {
          jquery(tabela).on('draw.dt.ponteScraper draw.ponteScraper', () => {
            estado.redesenhou = true;
          });
        }

        return estado;
      });

      try {
        const avancouPelaApi = await page.evaluate((anterior) => {
          const configuracao = anterior.configuracao;
          if (!configuracao) return false;

          if (typeof configuracao.oInstance?.fnPageChange === 'function') {
            configuracao.oInstance.fnPageChange('next');
            return true;
          }

          const jquery = window.jQuery;
          if (typeof jquery?.fn?.DataTable === 'function') {
            jquery(configuracao.nTable).DataTable().page('next').draw('page');
            return true;
          }

          return false;
        }, estadoAnterior);

        if (!avancouPelaApi) await page.click(seletorProxima);

        await page.waitForFunction(
          (anterior) => {
            const tabela = document.querySelector('table#documentos tbody');
            const temLinhas =
              tabela &&
              Array.from(tabela.querySelectorAll('tr')).some(
                (linha) => linha.querySelectorAll('td').length >= 2,
              );

            if (!temLinhas) return false;

            if (anterior.configuracao) {
              return (
                anterior.redesenhou &&
                anterior.configuracao._iDisplayStart !== anterior.inicio
              );
            }

            return (
              !anterior.primeiraLinha.isConnected ||
              tabela.innerText !== anterior.linhas
            );
          },
          {},
          estadoAnterior,
        );
      } catch (erro) {
        if (erro.name === 'TimeoutError') {
          const diagnostico = await page.evaluate(
            (anterior) => ({
              dataTablesDetectado: Boolean(anterior.configuracao),
              inicioAnterior: anterior.inicio,
              inicioAtual: anterior.configuracao?._iDisplayStart,
              redesenhou: anterior.redesenhou,
              linhasAlteradas:
                document.querySelector('table#documentos tbody')?.innerText !==
                anterior.linhas,
              primeiraLinhaSubstituida: !anterior.primeiraLinha.isConnected,
              paginaAtiva: document
                .querySelector('#documentos_paginate li.active')
                ?.textContent.trim(),
              proximaDesativada: document
                .querySelector('#documentos_paginate li.next')
                ?.classList.contains('disabled'),
            }),
            estadoAnterior,
          );
          erro.message += `\nDiagnostico da paginacao: ${JSON.stringify(diagnostico)}`;
        }
        throw erro;
      } finally {
        try {
          await page.evaluate(() => {
            window.jQuery?.('table#documentos').off('.ponteScraper');
          });
        } finally {
          await estadoAnterior.dispose();
        }
      }
    }

    const invoices = normalizeInvoices(faturas, headers, recipientNif, mapping);
    if (
      invoices.some(
        (invoice) => invoice.date < period.start || invoice.date > period.end,
      )
    )
      throw new Error(
        'O portal retornou faturas fora do intervalo. Verifique a aplicacao dos filtros; arquivo nao exportado.',
      );
    const output = process.env.EFATURA_OUTPUT || 'faturas.json';
    const result = {
      schemaVersion: 1,
      source: 'E_FATURA',
      period,
      bankImportId: config.bankImportId,
      capturedAt: new Date().toISOString(),
      headers,
      invoices,
      rawRows: faturas.map((row) => ({
        ...row,
        links: row.links.filter((link) => safePortalLink(link.url)),
      })),
    };
    if (integrated) {
      await new Promise((resolve, reject) =>
        process.send({ result }, (error) =>
          error ? reject(error) : resolve(),
        ),
      );
    } else {
      await writeFile(output, JSON.stringify(result, null, 2), {
        mode: 0o600,
        flag: 'wx',
      });
    }
    console.log(
      `${invoices.length} faturas exportadas para ${output}. Importe o JSON na Ponte.`,
    );
  } catch (erro) {
    if (integrated) process.send({ error: 'CONSULTATION_FAILED' });
    else console.error('Falha na exportacao:', erro.message);
    process.exitCode = 1;
  } finally {
    // Fechar o navegador. Pode comentar esta linha para analisar o estado final do browser.
    await browser.close();
    if (integrated) process.disconnect();
  }
})().catch((error) => {
  if (integrated) {
    process.send({ error: 'BROWSER_UNAVAILABLE' });
    process.disconnect();
  } else console.error(error.message);
  process.exitCode = 1;
});
