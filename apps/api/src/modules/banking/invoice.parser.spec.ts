import { parseInvoices, invoiceUrl } from './invoice.parser';
const invoice = {
  issuerName: 'Energia',
  issuerTaxId: '123456789',
  recipientTaxId: '987654321',
  number: 'FT 2026/99',
  date: '2026-10-07',
  amount: '1234.56',
  currency: 'EUR',
  documentUrl: 'https://faturas.portaldasfinancas.gov.pt/detalhe?id=99',
};
function upload(value: unknown) {
  const buffer = Buffer.from(JSON.stringify(value));
  return {
    originalname: 'faturas.json',
    mimetype: 'application/json',
    size: buffer.length,
    buffer,
  };
}
const batch = (items: unknown[] = [invoice]) => ({
  schemaVersion: 1,
  source: 'E_FATURA',
  capturedAt: '2026-10-07T10:00:00Z',
  invoices: items,
});
describe('Private e-fatura import validation', () => {
  it('validates the extraction period and rejects invoices outside it', () => {
    expect(() =>
      parseInvoices(
        upload({
          ...batch(),
          period: { start: '2026-08-01', end: '2026-10-07' },
        }),
      ),
    ).not.toThrow();
    for (const period of [
      { start: '2026-08-01', end: '2026-10-06' },
      { start: '2026-10-08', end: '2026-10-07' },
      { start: '2026-02-30', end: '2026-10-07' },
    ])
      expect(() => parseInvoices(upload({ ...batch(), period }))).toThrow();
  });
  it('preserves decimal precision, identity, dates and official links', () => {
    const parsed = parseInvoices(upload(batch()));
    expect(parsed.invoices[0]).toMatchObject({
      amount: '1234.56',
      number: invoice.number,
      documentUrl: invoice.documentUrl,
    });
    expect(parsed.invoices[0].fingerprint).toHaveLength(64);
    expect(
      parseInvoices(upload(batch([{ ...invoice, issuerName: 'New name' }])))
        .invoices[0].fingerprint,
    ).toBe(parsed.invoices[0].fingerprint);
  });
  it.each([
    'https://evil.example/invoice',
    'http://faturas.portaldasfinancas.gov.pt/file',
    'javascript:alert(1)',
    'https://faturas.portaldasfinancas.gov.pt.evil.example/file',
    'https://user:pass@faturas.portaldasfinancas.gov.pt/file',
    'https://faturas.portaldasfinancas.gov.pt/file?token=secret',
  ])('rejects unsafe document URL %s', (url) => {
    expect(() => invoiceUrl(url)).toThrow();
  });
  it.each([
    { date: '2026-02-30' },
    { amount: '1,10' },
    { amount: '1.000' },
    { amount: '1000000000000.00' },
    { currency: 'eur' },
    { issuerTaxId: 'abc' },
  ])('rejects malformed invoice %j', (fields) => {
    expect(() =>
      parseInvoices(upload(batch([{ ...invoice, ...fields }]))),
    ).toThrow();
  });
  it('validates file extension, MIME, traversal and size', () => {
    const file = upload(batch());
    for (const patch of [
      { originalname: '../faturas.json' },
      { originalname: 'faturas.exe' },
      { mimetype: 'text/html' },
      { size: 1 },
    ])
      expect(() => parseInvoices({ ...file, ...patch })).toThrow();
  });
  it('supports credit notes, missing links and empty filtered periods', () => {
    expect(
      parseInvoices(
        upload(batch([{ ...invoice, amount: '-20.10', documentUrl: null }])),
      ).invoices[0].amount,
    ).toBe('-20.10');
    expect(parseInvoices(upload(batch([]))).invoices).toEqual([]);
  });
  it('keeps zero-value invoices without rejecting the entire batch', () => {
    const items = Array.from({ length: 45 }, (_, index) => ({
      ...invoice,
      number: `FT 2026/${index + 1}`,
      amount: index === 44 ? '0.00' : invoice.amount,
    }));
    const parsed = parseInvoices(upload(batch(items)));
    expect(parsed.invoices).toHaveLength(45);
    expect(parsed.invoices[44].amount).toBe('0.00');
  });
});
