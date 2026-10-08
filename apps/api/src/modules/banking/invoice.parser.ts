/* eslint-disable no-control-regex -- reject control characters in uploaded names and invoice fields */
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrivateUpload } from '../finance/storage.service';

export function invoiceUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2000)
    throw new Error('Link inválido');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    ![
      'faturas.portaldasfinancas.gov.pt',
      'www.portaldasfinancas.gov.pt',
    ].includes(url.hostname) ||
    /(?:session|token|password|senha)/i.test(url.pathname + url.search)
  )
    throw new Error(
      'Use um link HTTPS do Portal das Finanças sem credenciais ou sessão',
    );
  return url.href;
}

function text(row: Record<string, unknown>, key: string, max: number) {
  const value = row[key];
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x1f]/.test(value)
  )
    throw new Error(`Campo ${key} inválido`);
  return value.trim();
}

export function parseInvoices(file: PrivateUpload) {
  try {
    if (
      !file ||
      !/^[^\\/:\x00-\x1f]{1,255}\.json$/i.test(file.originalname) ||
      !['application/json', 'text/plain', 'application/octet-stream'].includes(
        file.mimetype,
      ) ||
      file.size !== file.buffer.length ||
      file.size <= 0 ||
      file.size > 10 * 1024 * 1024
    )
      throw new Error('Envie um JSON de até 10 MB');
    const input = JSON.parse(
      file.buffer.toString('utf8').replace(/^\uFEFF/, ''),
    );
    if (
      input.schemaVersion !== 1 ||
      input.source !== 'E_FATURA' ||
      !Array.isArray(input.invoices) ||
      input.invoices.length > 10000
    )
      throw new Error('Formato de exportação e-fatura inválido');
    const capturedAt = new Date(input.capturedAt);
    if (
      typeof input.capturedAt !== 'string' ||
      !Number.isFinite(capturedAt.getTime())
    )
      throw new Error('Data de extração inválida');
    const period = input.period;
    if (
      period !== undefined &&
      (!period ||
        ![period.start, period.end].every(
          (value) =>
            typeof value === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(value) &&
            Number.isFinite(new Date(value).getTime()) &&
            new Date(value).toISOString().slice(0, 10) === value,
        ) ||
        period.start > period.end)
    )
      throw new Error('Período inválido');
    const invoices = input.invoices.map(
      (row: Record<string, unknown>, index: number) => {
        try {
          if (!row || typeof row !== 'object')
            throw new Error('Documento inválido');
          const issuerName = text(row, 'issuerName', 200);
          const issuerTaxId = text(row, 'issuerTaxId', 32);
          const recipientTaxId = text(row, 'recipientTaxId', 32);
          const number = text(row, 'number', 200);
          const date = text(row, 'date', 10);
          if (period && (date < period.start || date > period.end))
            throw new Error('Fatura fora do período declarado');
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(new Date(date).getTime()) ||
            new Date(date).toISOString().slice(0, 10) !== date
          )
            throw new Error('Data inválida');
          const amount = text(row, 'amount', 16);
          if (
            !/^-?(?:0|[1-9]\d{0,11})\.\d{2}$/.test(amount) ||
            new Prisma.Decimal(amount).isZero()
          )
            throw new Error(
              'Valor inválido; use decimal com ponto e duas casas',
            );
          const currency = text(row, 'currency', 3);
          if (
            !/^[A-Z]{3}$/.test(currency) ||
            !/^\d{9}$/.test(issuerTaxId) ||
            !/^\d{9}$/.test(recipientTaxId)
          )
            throw new Error('Moeda ou NIF inválido');
          const fingerprint = createHash('sha256')
            .update(
              JSON.stringify([
                issuerTaxId,
                recipientTaxId,
                number.toUpperCase(),
                date,
                amount,
                currency,
              ]),
            )
            .digest('hex');
          return {
            issuerName,
            issuerTaxId,
            recipientTaxId,
            number,
            date: new Date(date),
            amount,
            currency,
            documentUrl: invoiceUrl(row.documentUrl),
            fingerprint,
          };
        } catch (error) {
          throw new Error(`Fatura ${index + 1}: ${(error as Error).message}`);
        }
      },
    );
    return {
      capturedAt,
      invoices,
      period: period
        ? { start: period.start as string, end: period.end as string }
        : null,
    };
  } catch (error) {
    throw new BadRequestException((error as Error).message);
  }
}
