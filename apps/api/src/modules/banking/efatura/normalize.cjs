const canonical = (value) =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const aliases = {
  issuerName: ['emitente', 'nomeemitente', 'fornecedor', 'denominacao'],
  issuerTaxId: ['nifemitente', 'niffornecedor', 'nif'],
  number: [
    'numerodocumento',
    'numerofatura',
    'documento',
    'numerodafatura',
    'nfatura',
    'nfaturaatcud',
    'numerofaturaatcud',
  ],
  date: ['data', 'dataemissao', 'datadocumento'],
  amount: ['total', 'valortotal', 'montante', 'totalcomiva'],
};
const extractionError = (code, field) =>
  Object.assign(new Error(code), { code, field });
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
    let index =
      mapping[field] ??
      headers.findIndex((header) => names.includes(canonical(header)));
    // The current portal combines "NIF - name" in the Emitente column.
    if (field === 'issuerTaxId' && index < 0 && mapping[field] === undefined) {
      index = headers.findIndex((header) => canonical(header) === 'emitente');
    }
    if (!Number.isInteger(index) || index < 0 || index >= headers.length)
      throw extractionError('INVOICE_COLUMN_UNKNOWN', field);
    indices[field] = index;
  }
  return rows.map((row) => {
    const result = {};
    for (const [field, position] of Object.entries(indices))
      result[field] = row.cells[position]?.trim() || '';
    if (indices.issuerTaxId === indices.issuerName) {
      const issuer = result.issuerName.match(/^(\d{9})\s*[-–—]\s*(.+)$/);
      if (!issuer) throw extractionError('INVOICE_IDENTITY_INVALID');
      result.issuerTaxId = issuer[1];
      result.issuerName = issuer[2].trim();
    }
    if (canonical(headers[indices.number]).endsWith('atcud')) {
      result.number = result.number.replace(/\s+\/\s+[A-Z0-9]{8}-\d+$/i, '');
    }
    const date = result.date.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (date) result.date = `${date[3]}-${date[2]}-${date[1]}`;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(result.date) ||
      !Number.isFinite(new Date(result.date).getTime()) ||
      new Date(result.date).toISOString().slice(0, 10) !== result.date
    )
      throw extractionError('INVOICE_DATE_INVALID', 'date');
    let amount = result.amount.replace(/[€\s\u00a0]/g, '');
    if (/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(amount))
      amount = amount.replace(/\./g, '').replace(',', '.');
    if (!/^-?\d+\.\d{2}$/.test(amount))
      throw extractionError('INVOICE_AMOUNT_INVALID', 'amount');
    amount = amount.replace(/^(-?)0+(?=\d)/, '$1');
    if (amount === '-0.00') amount = '0.00';
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
      throw extractionError('INVOICE_LINK_AMBIGUOUS', 'documentUrl');
    result.documentUrl = relevant[0]?.url ?? null;
    if (
      !/^\d{9}$/.test(result.issuerTaxId) ||
      !result.issuerName ||
      !result.number
    )
      throw extractionError('INVOICE_IDENTITY_INVALID');
    return result;
  });
}
module.exports = { normalizeInvoices, safePortalLink };
