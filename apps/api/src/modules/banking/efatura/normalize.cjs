const canonical = (value) =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const aliases = {
  issuerName: ['emitente', 'nomeemitente', 'fornecedor', 'denominacao'],
  issuerTaxId: ['nifemitente', 'niffornecedor', 'nif'],
  number: ['numerodocumento', 'numerofatura', 'documento', 'numerodafatura'],
  date: ['data', 'dataemissao', 'datadocumento'],
  amount: ['total', 'valortotal', 'montante', 'totalcomiva'],
};
function safePortalLink(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.port &&
      [
        'faturas.portaldasfinancas.gov.pt',
        'www.portaldasfinancas.gov.pt',
      ].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !/(?:session|token|password|senha)/i.test(url.pathname + url.search)
    );
  } catch {
    return false;
  }
}
function normalizeInvoices(rows, headers, recipientTaxId, mapping = {}) {
  if (!/^\d{9}$/.test(recipientTaxId || ''))
    throw new Error(
      'EFATURA_RECIPIENT_NIF deve identificar o titular das faturas',
    );
  const indices = {};
  for (const [field, names] of Object.entries(aliases)) {
    const index =
      mapping[field] ??
      headers.findIndex((header) => names.includes(canonical(header)));
    if (!Number.isInteger(index) || index < 0 || index >= headers.length)
      throw new Error(
        `Coluna ${field} desconhecida. Configure EFATURA_COLUMNS com índices iniciados em zero. Cabeçalhos: ${JSON.stringify(headers)}`,
      );
    indices[field] = index;
  }
  return rows.map((row, index) => {
    const result = {};
    for (const [field, position] of Object.entries(indices))
      result[field] = row.cells[position]?.trim() || '';
    const date = result.date.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (date) result.date = `${date[3]}-${date[2]}-${date[1]}`;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(result.date) ||
      !Number.isFinite(new Date(result.date).getTime()) ||
      new Date(result.date).toISOString().slice(0, 10) !== result.date
    )
      throw new Error(`Linha ${index + 1}: data inválida`);
    let amount = result.amount.replace(/[€\s\u00a0]/g, '');
    if (/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(amount))
      amount = amount.replace(/\./g, '').replace(',', '.');
    if (!/^-?\d+\.\d{2}$/.test(amount))
      throw new Error(`Linha ${index + 1}: valor ambíguo ou inválido`);
    result.amount = amount;
    result.issuerTaxId = result.issuerTaxId.replace(/\s/g, '');
    result.recipientTaxId = recipientTaxId;
    result.currency = 'EUR';
    const links = row.links.filter((link) => safePortalLink(link.url));
    const relevant =
      mapping.documentUrl === undefined
        ? links
        : links.filter((link) => link.column === mapping.documentUrl);
    if (relevant.length > 1)
      throw new Error(
        `Linha ${index + 1}: vários links; configure documentUrl em EFATURA_COLUMNS`,
      );
    result.documentUrl = relevant[0]?.url ?? null;
    if (
      !/^\d{9}$/.test(result.issuerTaxId) ||
      !result.issuerName ||
      !result.number
    )
      throw new Error(`Linha ${index + 1}: emitente, NIF ou número inválido`);
    return result;
  });
}
module.exports = { normalizeInvoices, safePortalLink };
