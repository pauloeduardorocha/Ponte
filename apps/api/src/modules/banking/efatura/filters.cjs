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
      'Defina datas ISO válidas e início <= fim para a consulta.',
    );
  return period;
}
async function applyDateFilters(page, period, submitSelector) {
  validatePeriod(period);
  await page.waitForSelector('#dataInicioFilter', { visible: true });
  await page.waitForSelector('#dataFimFilter', { visible: true });
  // The portal starts an initial AJAX search on page load. Its late response
  // must finish before another search can safely update the same table.
  await page.waitForFunction(() => {
    const results = document.querySelector('.searchResults');
    const empty = document.querySelector('.noSearchResults');
    return (
      !results ||
      !empty ||
      !results.classList.contains('hide') ||
      !empty.classList.contains('hide')
    );
  });
  const usesResultPanels = await page.evaluate(({ start, end }) => {
    for (const [id, value] of [
      ['dataInicioFilter', start],
      ['dataFimFilter', end],
    ]) {
      const input = document.getElementById(id);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return Boolean(
      document.querySelector('.searchResults') &&
      document.querySelector('.noSearchResults'),
    );
  }, period);
  // Allow an explicit selector when the portal changes its filter form.
  if (submitSelector) {
    await page.waitForSelector(submitSelector, { visible: true });
    await page.click(submitSelector);
  } else {
    const submitted = await page.evaluate(() => {
      const form = document.getElementById('dataInicioFilter').closest('form');
      let submit = form?.querySelector(
        'button[type="submit"], input[type="submit"]',
      );
      if (!submit) {
        const scope = form || document;
        const candidates = Array.from(
          scope.querySelectorAll(
            'button, input[type="button"], input[type="submit"], a[role="button"]',
          ),
        ).filter((button) => {
          const label = (
            button.textContent ||
            button.value ||
            button.getAttribute('aria-label') ||
            ''
          )
            .trim()
            .toLocaleLowerCase('pt-PT');
          return (
            /^(pesquisar|pesquisa|consultar|filtrar|procurar)$/.test(label) &&
            !button.disabled &&
            button.getClientRects().length > 0
          );
        });
        // Never choose an arbitrary action when the portal has multiple matches.
        if (candidates.length === 1) submit = candidates[0];
      }
      if (!submit) return false;
      submit.click();
      return true;
    });
    if (!submitted)
      throw Object.assign(
        new Error(
          'Não foi possível aplicar automaticamente os filtros de data no portal.',
        ),
        { code: 'FILTER_SUBMIT_NOT_FOUND' },
      );
  }
  if (usesResultPanels) {
    // searchAction hides both panels synchronously. The success callback shows
    // exactly one after updating DataTables; background requests do not matter.
    await page.waitForFunction(() => {
      const results = document.querySelector('.searchResults');
      const empty = document.querySelector('.noSearchResults');
      return (
        results &&
        empty &&
        (!results.classList.contains('hide') ||
          !empty.classList.contains('hide'))
      );
    });
    return page.evaluate(() => ({
      empty:
        !document
          .querySelector('.noSearchResults')
          .classList.contains('hide') &&
        document.querySelector('.searchResults').classList.contains('hide'),
    }));
  }
  // Compatibility with explicitly configured/legacy portal layouts.
  await page.waitForNetworkIdle();
  return { empty: false };
}
module.exports = { validatePeriod, applyDateFilters };
