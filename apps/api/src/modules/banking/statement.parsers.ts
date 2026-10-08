import { inflateRawSync } from 'node:zlib';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import type { PrivateUpload } from '../finance/storage.service';
export type UploadedFile = PrivateUpload;
export interface ParsedBankTransaction {
  date: string;
  amount: string;
  direction: 'CREDIT' | 'DEBIT';
  description: string;
  reference: string;
  bankIdentifier: string | null;
  account: string | null;
  currency: string | null;
  rowNumber: number;
}
export interface BankStatementParser {
  supports(file: UploadedFile): boolean;
  parse(file: UploadedFile): Promise<ParsedBankTransaction[]>;
}
export const MAX_BANK_ROWS = 10000;
const clean = (v: unknown) => String(v ?? '').trim();
export const canonical = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
export function normalizedDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = clean(value);
  let date = text;
  const eu = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(text);
  if (eu) date = `${eu[3]}-${eu[2]}-${eu[1]}`;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error('Data inválida');
  return date;
}
export function normalizedAmount(value: unknown) {
  let text = clean(value)
    .replace(/[\s\u00a0]/g, '')
    .replace(/(?:EUR|BRL|USD|€|R\$)/gi, '');
  if (/^\(.*\)$/.test(text)) text = '-' + text.slice(1, -1);
  if (text.includes(',')) {
    if (text.includes('.') && text.lastIndexOf('.') > text.lastIndexOf(','))
      text = text.replaceAll(',', '');
    else text = text.replaceAll('.', '').replace(',', '.');
  }
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(text))
    throw new Error('Montante inválido: use até duas casas decimais');
  const decimal = new Prisma.Decimal(text);
  if (decimal.isZero() || decimal.abs().gte('1000000000000'))
    throw new Error('Montante fora dos limites');
  return {
    amount: decimal.abs().toFixed(2),
    direction: decimal.isNegative() ? ('DEBIT' as const) : ('CREDIT' as const),
  };
}
const headers = {
  date: [
    'date',
    'data',
    'datalancamento',
    'datalanamento',
    'datamovimento',
    'bookingdate',
  ],
  amount: ['amount', 'valor', 'montante', 'importe'],
  description: ['description', 'descricao', 'descrio', 'descritivo', 'memo'],
  reference: ['reference', 'referencia', 'ref'],
  bankIdentifier: [
    'bankidentifier',
    'fitid',
    'id',
    'identificador',
    'identificadorbancario',
  ],
  direction: ['direction', 'tipo', 'type', 'debitocredito'],
  credit: ['credit', 'credito', 'crdito'],
  debit: ['debit', 'debito', 'dbito'],
  currency: ['currency', 'moeda'],
  account: ['account', 'conta', 'iban'],
} as const;
function positions(row: unknown[]) {
  const names = row.map((v) => canonical(clean(v)));
  return Object.fromEntries(
    Object.entries(headers).map(([key, aliases]) => [
      key,
      names.findIndex((n) => (aliases as readonly string[]).includes(n)),
    ]),
  ) as Record<keyof typeof headers, number>;
}
export function tableTransactions(rows: unknown[][]) {
  if (rows.length > MAX_BANK_ROWS + 100)
    throw new Error('Limite de 10000 movimentos');
  const index = rows.findIndex((row) => {
    const p = positions(row);
    return (
      p.date >= 0 &&
      (p.amount >= 0 || p.credit >= 0 || p.debit >= 0) &&
      p.description >= 0
    );
  });
  if (index < 0)
    throw new Error(
      'Cabeçalho não encontrado. São necessárias data, descrição e montante (ou débito/crédito)',
    );
  const p = positions(rows[index]!);
  let account: string | null = null,
    currency: string | null = null;
  for (const row of rows.slice(0, index)) {
    if (canonical(clean(row[0])) === 'conta') {
      const v = row.slice(1).map(clean).find(Boolean);
      const match = v?.match(/^(.+?)\s*-\s*([A-Z]{3})$/);
      if (match) {
        account = match[1]!.trim();
        currency = match[2]!;
      } else account = v ?? null;
    }
  }
  const result: ParsedBankTransaction[] = [];
  for (let i = index + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.every((v) => !clean(v))) continue;
    try {
      const get = (key: keyof typeof headers) =>
        p[key] < 0 ? '' : clean(row[p[key]]);
      let value: unknown = row[p.amount];
      let explicit = get('direction');
      if (p.amount < 0) {
        const credit = get('credit'),
          debit = get('debit');
        if (
          credit &&
          debit &&
          new Prisma.Decimal(credit.replace(',', '.')).gt(0) &&
          new Prisma.Decimal(debit.replace(',', '.')).gt(0)
        )
          throw new Error('Débito e crédito simultâneos');
        if (debit && !/^[+-]?0+(?:[.,]0+)?$/.test(debit)) {
          value = debit;
          explicit = 'DEBIT';
        } else {
          value = credit;
          explicit = 'CREDIT';
        }
      }
      const money = normalizedAmount(value);
      if (explicit) {
        const d = canonical(explicit);
        if (['debit', 'debito', 'd', 'saida', 'expense'].includes(d))
          money.direction = 'DEBIT';
        else if (['credit', 'credito', 'c', 'entrada', 'income'].includes(d)) {
          if (money.direction === 'DEBIT')
            throw new Error('Crédito incompatível com sinal negativo');
          money.direction = 'CREDIT';
        } else throw new Error('Tipo débito/crédito inválido');
      }
      const description = get('description');
      if (!description || description.length > 2000)
        throw new Error('Descrição inválida');
      const ref = get('reference'),
        bankId = get('bankIdentifier');
      if (ref.length > 200 || bankId.length > 200)
        throw new Error('Referência longa demais');
      result.push({
        date: normalizedDate(row[p.date]),
        ...money,
        description,
        reference: ref,
        bankIdentifier: bankId || null,
        account: get('account') || account,
        currency: get('currency') || currency,
        rowNumber: i + 1,
      });
    } catch (e) {
      throw new Error(`Linha ${i + 1}: ${(e as Error).message}`);
    }
  }
  if (!result.length || result.length > MAX_BANK_ROWS)
    throw new Error('Arquivo sem movimentos ou acima de 10000 linhas');
  return result;
}
export class CsvStatementParser implements BankStatementParser {
  supports(file: UploadedFile) {
    return extname(file.originalname).toLowerCase() === '.csv';
  }
  async parse(file: UploadedFile) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch {
      text = new TextDecoder('windows-1252').decode(file.buffer);
    }
    if (text.includes('\0')) throw new Error('CSV binário inválido');
    const prefix = text.slice(0, 65536);
    const first =
      prefix
        .split(/\r?\n/)
        .find(
          (line) =>
            /date|data/i.test(line) &&
            /amount|montante|valor|debito/i.test(line),
        ) ?? prefix.split(/\r?\n/)[0]!;
    const delimiter = [';', ',', '\t'].sort(
      (a, b) => first.split(b).length - first.split(a).length,
    )[0]!;
    let recordCount = 0;
    const rows = parse(text, {
      on_record: (record: string[]) => {
        if (++recordCount > MAX_BANK_ROWS + 100 || record.length > 100)
          throw new Error('CSV excede limites de linhas ou colunas');
        return record;
      },
      delimiter,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      max_record_size: 100000,
    }) as unknown[][];
    return tableTransactions(rows);
  }
}
// Inspect ZIP central directory before decompression to bound XLSX expansion.
function validateZip(buffer: Buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('XLSX inválido');
  const count = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16);
  if (
    buffer.readUInt16LE(end + 4) ||
    buffer.readUInt16LE(end + 6) ||
    count !== buffer.readUInt16LE(end + 8) ||
    offset + buffer.readUInt32LE(end + 12) !== end
  )
    throw new Error('ZIP incompatível');
  if (count > 2000) throw new Error('XLSX muito complexo');
  let size = 0,
    pos = offset;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== 0x02014b50)
      throw new Error('ZIP inválido');
    const expanded = buffer.readUInt32LE(pos + 24);
    const compressed = buffer.readUInt32LE(pos + 20);
    const method = buffer.readUInt16LE(pos + 10);
    const local = buffer.readUInt32LE(pos + 42);
    if (
      buffer.readUInt16LE(pos + 8) & 1 ||
      ![0, 8].includes(method) ||
      local + 30 > buffer.length ||
      buffer.readUInt32LE(local) !== 0x04034b50
    )
      throw new Error('ZIP incompatível');
    const start =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    if (start + compressed > offset || expanded + size > 40 * 1024 * 1024)
      throw new Error('XLSX expandido excede limites');
    const data = buffer.subarray(start, start + compressed);
    const actual =
      method === 8
        ? inflateRawSync(data, {
            maxOutputLength: 40 * 1024 * 1024 - size || 1,
          }).length
        : data.length;
    if (actual !== expanded) throw new Error('Tamanho ZIP inconsistente');
    size += actual;
    pos +=
      46 +
      buffer.readUInt16LE(pos + 28) +
      buffer.readUInt16LE(pos + 30) +
      buffer.readUInt16LE(pos + 32);
  }
  if (pos !== end) throw new Error('Diretório ZIP inconsistente');
}
export class XlsxStatementParser implements BankStatementParser {
  supports(file: UploadedFile) {
    return extname(file.originalname).toLowerCase() === '.xlsx';
  }
  async parse(file: UploadedFile) {
    validateZip(file.buffer);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.buffer as never);
    const candidates: ParsedBankTransaction[][] = [];
    for (const sheet of book.worksheets) {
      if (sheet.rowCount > MAX_BANK_ROWS + 100 || sheet.columnCount > 100)
        throw new Error('Planilha excede limites');
      const rows: unknown[][] = [];
      sheet.eachRow({ includeEmpty: true }, (row) => {
        const values: unknown[] = [];
        for (let i = 1; i <= sheet.columnCount; i++) {
          const cell = row.getCell(i);
          if (cell.type === ExcelJS.ValueType.Formula)
            throw new Error('Fórmulas não são permitidas em extratos');
          // ExcelJS repeats the master value in every cell of a merged range.
          if (cell.isMerged && cell.master.address !== cell.address) {
            values.push('');
            continue;
          }
          values.push(
            cell.value instanceof Date
              ? cell.value
              : cell.value === null
                ? ''
                : cell.text,
          );
        }
        rows.push(values);
      });
      if (
        rows.some((r) => {
          const p = positions(r);
          return (
            p.date >= 0 &&
            (p.amount >= 0 || p.credit >= 0 || p.debit >= 0) &&
            p.description >= 0
          );
        })
      )
        candidates.push(tableTransactions(rows));
    }
    if (candidates.length !== 1)
      throw new Error('O XLSX deve conter exatamente uma tabela de movimentos');
    return candidates[0]!;
  }
}
export class OfxStatementParser implements BankStatementParser {
  supports(file: UploadedFile) {
    return extname(file.originalname).toLowerCase() === '.ofx';
  }
  async parse(file: UploadedFile) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch {
      text = new TextDecoder('windows-1252').decode(file.buffer);
    }
    if (!/<OFX[\s>]/i.test(text) || /<!DOCTYPE|<!ENTITY/i.test(text))
      throw new Error('OFX inválido');
    const tag = (src: string, name: string) =>
      new RegExp(`<${name}[^>]*>\\s*([^<\\r\\n]*)`, 'i')
        .exec(src)?.[1]
        ?.trim() ?? '';
    for (const name of ['ACCTID', 'CURDEF']) {
      const values = [
        ...text.matchAll(
          new RegExp('<' + name + '[^>]*>\\s*([^<\\r\\n]*)', 'gi'),
        ),
      ].map((m) => canonical(m[1] ?? ''));
      if (new Set(values).size > 1)
        throw new Error('OFX deve conter somente uma conta e uma moeda');
    }
    const account = tag(text, 'ACCTID') || null,
      currency = tag(text, 'CURDEF') || null;
    const blocks = [...text.matchAll(/<STMTTRN>\s*([\s\S]*?)<\/STMTTRN>/gi)];
    if (!blocks.length || blocks.length > MAX_BANK_ROWS)
      throw new Error('OFX sem movimentos ou acima do limite');
    return blocks.map((block, i) => {
      const b = block[1]!,
        d = tag(b, 'DTPOSTED').slice(0, 8);
      const money = normalizedAmount(tag(b, 'TRNAMT'));
      const type = tag(b, 'TRNTYPE').toUpperCase();
      if (
        (type === 'DEBIT' && money.direction !== 'DEBIT') ||
        (type === 'CREDIT' && money.direction !== 'CREDIT')
      )
        throw new Error('Tipo OFX incompatível com sinal');
      return {
        date: normalizedDate(
          `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        ),
        ...money,
        description:
          [tag(b, 'NAME'), tag(b, 'MEMO')]
            .filter(Boolean)
            .join(' ')
            .slice(0, 2000) || 'Movimento bancário',
        reference: tag(b, 'REFNUM') || tag(b, 'CHECKNUM'),
        bankIdentifier: tag(b, 'FITID') || null,
        account,
        currency,
        rowNumber: i + 1,
      };
    });
  }
}
export function transactionFingerprint(
  accountId: string,
  t: ParsedBankTransaction,
) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        accountId,
        t.date,
        t.amount,
        t.direction,
        canonical(t.reference),
        canonical(t.bankIdentifier ?? ''),
      ]),
    )
    .digest('hex');
}
@Injectable()
export class StatementParserRegistry {
  constructor(
    private readonly parsers: BankStatementParser[] = [
      new CsvStatementParser(),
      new XlsxStatementParser(),
      new OfxStatementParser(),
    ],
  ) {}
  identify(file: UploadedFile) {
    const ext = extname(file?.originalname ?? '').toLowerCase();
    const allowed: Record<string, string[]> = {
      '.csv': [
        'text/csv',
        'application/csv',
        'application/vnd.ms-excel',
        'text/plain',
        'application/octet-stream',
      ],
      '.xlsx': [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream',
      ],
      '.ofx': [
        'application/x-ofx',
        'application/ofx',
        'application/xml',
        'text/xml',
        'application/vnd.intu.qbo',
        'text/plain',
        'application/octet-stream',
      ],
    };
    if (
      !file?.buffer ||
      file.size !== file.buffer.length ||
      file.size < 1 ||
      file.size > 10 * 1024 * 1024 ||
      !file.originalname ||
      /[\\/:]/.test(file.originalname) ||
      [...file.originalname].some((c) => c.charCodeAt(0) < 32) ||
      file.originalname.length > 255 ||
      !allowed[ext]?.includes(file.mimetype)
    )
      throw new BadRequestException(
        'Use CSV, XLSX ou OFX até 10 MB, com MIME compatível',
      );
    if (
      ext === '.xlsx' &&
      !file.buffer.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
    )
      throw new BadRequestException('Assinatura XLSX inválida');
    const parser = this.parsers.find((p) => p.supports(file));
    if (!parser) throw new BadRequestException('Formato não suportado');
    return { parser, format: ext.slice(1).toUpperCase() };
  }
}
