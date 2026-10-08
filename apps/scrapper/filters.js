const { createInterface } = require('node:readline/promises');
function validatePeriod(period) {
  if (
    !period ||
    ![period.start, period.end].every(
      (value) =>
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(new Date(value).getTime()) &&
        new Date(value).toISOString().slice(0, 10) === value,
    ) ||
    period.start > period.end
  )
    throw new Error(
      'Defina datas ISO validas e inicio <= fim no arquivo --config ou EFATURA_START/EFATURA_END',
    );
  return period;
}
async function applyDateFilters(page, period, submitSelector) {
  validatePeriod(period);
  await page.waitForSelector('#dataInicioFilter', { visible: true });
  await page.waitForSelector('#dataFimFilter', { visible: true });
  await page.evaluate(({ start, end }) => {
    for (const [id, value] of [
      ['dataInicioFilter', start],
      ['dataFimFilter', end],
    ]) {
      const input = document.getElementById(id);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, period);
  // The supplied demo does not identify the filter button. Prefer an explicit selector.
  if (submitSelector) {
    await page.waitForSelector(submitSelector, { visible: true });
    await page.click(submitSelector);
  } else {
    const submitted = await page.evaluate(() => {
      const form = document.getElementById('dataInicioFilter').closest('form');
      const submit = form?.querySelector(
        'button[type="submit"], input[type="submit"]',
      );
      if (!submit) return false;
      submit.click();
      return true;
    });
    if (!submitted) {
      if (process.send)
        throw new Error(
          'Não foi possível aplicar automaticamente os filtros de data no portal.',
        );
      const prompt = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      try {
        await prompt.question(
          'Datas preenchidas. Aplique a pesquisa no portal e pressione Enter aqui para continuar. ',
        );
      } finally {
        prompt.close();
      }
    }
  }
  await page.waitForNetworkIdle();
}
module.exports = { validatePeriod, applyDateFilters };
