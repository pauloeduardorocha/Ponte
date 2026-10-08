import ExcelJS from 'exceljs';
import {
  CsvStatementParser,
  XlsxStatementParser,
  OfxStatementParser,
  StatementParserRegistry,
  normalizedAmount,
  normalizedDate,
  transactionFingerprint,
} from './statement.parsers';
const file = (text: string, name = 'extrato.csv', mime = 'text/csv') => {
  const buffer = Buffer.from(text);
  return { buffer, size: buffer.length, originalname: name, mimetype: mime };
};
describe('Statement parsers', () => {
  it('parses quoted CSV, decimal comma, separate debit/credit and local dates', async () => {
    const rows = await new CsvStatementParser().parse(
      file(
        'Data;Descrição;Montante;Referência\n07/10/2026;"Oferta; evento";"1.234,50";R1\n07/10/2026;Energia;-20,05;R2',
      ),
    );
    expect(rows[0]).toMatchObject({
      date: '2026-10-07',
      amount: '1234.50',
      direction: 'CREDIT',
      description: 'Oferta; evento',
    });
    expect(rows[1]?.direction).toBe('DEBIT');
    const separate = await new CsvStatementParser().parse(
      file(
        'date,description,credit,debit\n2026-10-07,Credito,12.25,0\n2026-10-07,Debito,0,5.25',
      ),
    );
    expect(separate.map((r) => r.direction)).toEqual(['CREDIT', 'DEBIT']);
  });
  it('handles both Millennium layouts without treating balances as amounts', async () => {
    for (const balance of [true, false]) {
      const workbook = new ExcelJS.Workbook(),
        sheet = workbook.addWorksheet('Sheet1');
      sheet.addRow(['Millennium bcp']);
      sheet.addRow(['Conta', '', '123 - EUR']);
      sheet.mergeCells('A2:B2');
      for (let i = 3; i <= 7; i++) sheet.addRow([]);
      sheet.addRow([
        'Data Lan�amento',
        'Data Valor',
        'Descri��o',
        'Montante',
        ...(balance ? ['Saldo Contabilistico'] : []),
        'Moeda',
        'Notas',
        'Tratado',
      ]);
      sheet.addRow([
        '07/10/2026',
        '06/10/2026',
        'Pessoa Exemplo',
        -25.15,
        ...(balance ? [1000] : []),
        'EUR',
        '',
        'Não',
      ]);
      sheet.addRow([]);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      const rows = await new XlsxStatementParser().parse({
        buffer,
        size: buffer.length,
        originalname: 'bank.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        rowNumber: 9,
        date: '2026-10-07',
        amount: '25.15',
        direction: 'DEBIT',
        account: '123',
        currency: 'EUR',
      });
    }
  });
  it('supports SGML and XML OFX and rejects DTD declarations and invalid signs', async () => {
    const parser = new OfxStatementParser();
    for (const closing of [true, false]) {
      const tag = (n: string, v: string) =>
        `<${n}>${v}${closing ? `</${n}>` : ''}`;
      const text =
        '<OFX>' +
        tag('CURDEF', 'EUR') +
        '<STMTTRN>' +
        tag('DTPOSTED', '20261007') +
        tag('TRNAMT', '10.25') +
        tag('TRNTYPE', 'CREDIT') +
        tag('FITID', 'A1') +
        tag('MEMO', 'Oferta') +
        '</STMTTRN></OFX>';
      const rows = await parser.parse(file(text, 'x.ofx', 'application/x-ofx'));
      expect(rows[0]).toMatchObject({
        bankIdentifier: 'A1',
        direction: 'CREDIT',
        amount: '10.25',
      });
    }
    await expect(
      parser.parse(file('<!DOCTYPE x><OFX></OFX>', 'x.ofx')),
    ).rejects.toThrow();
  });
  it('rejects ambiguous dates, unknown formats, precision loss and invalid currency strings', () => {
    expect(() => normalizedDate('2026-02-30')).toThrow();
    expect(() => normalizedDate('10/07/26')).toThrow();
    expect(() => normalizedAmount('1.001')).toThrow();
    expect(() => normalizedAmount('0')).toThrow();
    expect(() =>
      new StatementParserRegistry().identify(file('x', 'file.exe')),
    ).toThrow();
  });
  it('fingerprints account, date, amount, direction and identifiers rather than description', () => {
    const row = {
      date: '2026-10-07',
      amount: '20.00',
      direction: 'CREDIT' as const,
      description: 'Origem',
      reference: 'R1',
      bankIdentifier: 'B1',
      currency: 'EUR',
      account: null,
      rowNumber: 1,
    };
    expect(transactionFingerprint('a', row)).toBe(
      transactionFingerprint('a', { ...row, description: 'Outro texto' }),
    );
    expect(transactionFingerprint('b', row)).not.toBe(
      transactionFingerprint('a', row),
    );
    expect(
      transactionFingerprint('a', { ...row, direction: 'DEBIT' }),
    ).not.toBe(transactionFingerprint('a', row));
  });
});
