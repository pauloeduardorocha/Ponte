import { ConfigService } from '@nestjs/config';
import { StorageService } from '../src/modules/finance/storage.service';
import {
  StatementParserRegistry,
  XlsxStatementParser,
} from '../src/modules/banking/statement.parsers';
import ExcelJS from 'exceljs';

describe('Private upload security', () => {
  const storage = new StorageService(new ConfigService());
  const registry = new StatementParserRegistry();
  const pdf = Buffer.from('%PDF-1.7\nTest');
  const file = (
    originalname = 'document.pdf',
    mimetype = 'application/pdf',
    buffer = pdf,
  ) => ({ originalname, mimetype, buffer, size: buffer.length });
  it.each([
    '../secret.pdf',
    'dir\\secret.pdf',
    'C:secret.pdf',
    'secret\u0000.pdf',
    'secret\n.pdf',
  ])('rejects unsafe attachment name %s', (name) => {
    expect(() => storage.validate(file(name))).toThrow();
  });
  it('validates extension, MIME, signature and actual size', () => {
    expect(() => storage.validate(file())).not.toThrow();
    expect(() => storage.validate(file('secret.exe'))).toThrow();
    expect(() => storage.validate(file('secret.pdf', 'text/plain'))).toThrow();
    expect(() =>
      storage.validate(
        file('secret.pdf', 'application/pdf', Buffer.from('fake')),
      ),
    ).toThrow();
    expect(() =>
      storage.validate({ ...file(), size: 10 * 1024 * 1024 + 1 }),
    ).toThrow();
    expect(() =>
      storage.validate(
        file('x.pdf', 'application/pdf', Buffer.alloc(10 * 1024 * 1024 + 1)),
      ),
    ).toThrow();
  });
  it('rejects unsafe storage keys and bank file names', async () => {
    await expect(storage.get('../secret')).rejects.toThrow();
    for (const name of ['../bank.csv', 'C:bank.csv', 'bank\u0000.csv'])
      expect(() =>
        registry.identify(file(name, 'text/csv', Buffer.from('date,amount'))),
      ).toThrow();
  });
  it('rejects XLSX archives whose declared expansion differs from real expansion', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Data').addRow(['date', 'amount', 'description']);
    const buffer = Buffer.from(await book.xlsx.writeBuffer());
    for (let pos = 0; pos + 46 < buffer.length; pos++) {
      if (
        buffer.readUInt32LE(pos) === 0x02014b50 &&
        buffer.readUInt32LE(pos + 24) > 0
      ) {
        buffer.writeUInt32LE(0, pos + 24);
        break;
      }
    }
    await expect(
      new XlsxStatementParser().parse(
        file(
          'bank.xlsx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer,
        ),
      ),
    ).rejects.toThrow('Tamanho ZIP inconsistente');
  });
});
