// Local, opt-in diagnostics: never read credentials, issuer fields or document links.
async function inspectDateFilters(page, period) {
  return page.evaluate(({ start, end }) => {
    const safeDate = (value) => {
      const text = String(value || '').trim();
      const match = text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
      const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : text;
      return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
    };
    const inputs = ['dataInicioFilter', 'dataFimFilter'].map((id) => {
      const input = document.getElementById(id);
      return {
        id,
        present: Boolean(input),
        type: input?.type,
        date: safeDate(input?.value),
        valid: input?.validity?.valid,
      };
    });
    const canonical = (text) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    const headers = Array.from(
      document.querySelectorAll('table#documentos thead th'),
    );
    const dateColumn = headers.findIndex((cell) =>
      ['data', 'dataemissao', 'datadocumento'].includes(
        canonical(cell.innerText),
      ),
    );
    const resultsPanel = document.querySelector('.searchResults');
    const emptyPanel = document.querySelector('.noSearchResults');
    const empty = Boolean(
      emptyPanel &&
      !emptyPanel.classList.contains('hide') &&
      resultsPanel?.classList.contains('hide'),
    );
    const dates =
      dateColumn < 0 || empty
        ? []
        : Array.from(document.querySelectorAll('table#documentos tbody tr'))
            .filter((row) => row.cells.length > 1)
            .map((row) => safeDate(row.cells[dateColumn]?.innerText));
    const validDates = dates.filter(Boolean).sort();
    return {
      inputs,
      empty,
      dateColumnFound: dateColumn >= 0,
      rows: dates.length,
      invalidDates: dates.filter((date) => !date).length,
      earliest: validDates[0] || null,
      latest: validDates.at(-1) || null,
      outsidePeriod: validDates.filter((date) => date < start || date > end)
        .length,
      hasNext: Boolean(
        !empty &&
        document.querySelector('#documentos_paginate li.next:not(.disabled) a'),
      ),
    };
  }, period);
}

function requestDates(request) {
  // Fixed parameter names and date-only values; do not retain a request URL/body.
  const dateNames =
    /^(dataInicio(?:Filter)?|dataFim(?:Filter)?|startDate|endDate)$/i;
  const result = {};
  for (const params of [
    new URL(request.url()).searchParams,
    new URLSearchParams(request.postData() || ''),
  ]) {
    for (const [name, value] of params) {
      if (dateNames.test(name)) {
        result[name] = /^\d{4}-\d{2}-\d{2}$|^\d{2}[/-]\d{2}[/-]\d{4}$/.test(
          value,
        )
          ? value
          : 'INVALID_DATE';
      }
    }
  }
  return Object.keys(result).length ? result : null;
}

module.exports = { inspectDateFilters, requestDates };
