import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrentUser } from '@church/shared';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { bindAudit, auditRequestFields } from '../audit/audit-context';
import { PrivateUpload, StorageService } from '../finance/storage.service';
import { InvoiceQuery } from './invoices.dto';
import { parseInvoices } from './invoice.parser';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
  ) {}
  async upload(file: PrivateUpload, user: CurrentUser) {
    const parsed = parseInvoices(file);
    const storageKey = await this.storage.putValidated(file);
    try {
      return await this.db.$transaction(async (tx) => {
        await bindAudit(tx);
        const imported = await tx.invoiceImport.create({
          data: {
            filename: file.originalname,
            storageKey,
            fileHash: createHash('sha256').update(file.buffer).digest('hex'),
            capturedAt: parsed.capturedAt,
            uploadedBy: user.id,
          },
        });
        const inserted = await tx.financialInvoice.createMany({
          data: parsed.invoices.map((invoice) => ({
            ...invoice,
            importId: imported.id,
          })),
          skipDuplicates: true,
        });
        await tx.auditLog.create({
          data: {
            ...auditRequestFields(),
            userId: user.id,
            action: 'FINANCE_INVOICE_IMPORT',
            entity: 'InvoiceImport',
            entityId: imported.id,
            metadata: {
              records: inserted.count,
              duplicates: parsed.invoices.length - inserted.count,
              period: parsed.period,
            },
          },
        });
        return {
          id: imported.id,
          inserted: inserted.count,
          duplicates: parsed.invoices.length - inserted.count,
        };
      });
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }
  async list(q: InvoiceQuery) {
    const where: Prisma.FinancialInvoiceWhereInput = {
      bankTransactionId: q.unassociated === 'true' ? null : undefined,
      date: {
        gte: q.start ? new Date(q.start) : undefined,
        lte: q.end ? new Date(q.end) : undefined,
      },
      OR: q.search
        ? ['issuerName', 'issuerTaxId', 'number'].map((key) => ({
            [key]: { contains: q.search, mode: 'insensitive' },
          }))
        : undefined,
    };
    const [items, total] = await Promise.all([
      this.db.financialInvoice.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.financialInvoice.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async suggestions(id: string) {
    const movement = await this.db.bankTransaction.findUnique({
      where: { id },
      include: { import: { include: { account: true } } },
    });
    if (!movement) throw new NotFoundException();
    const signed =
      movement.direction === 'DEBIT'
        ? movement.amount
        : movement.amount.negated();
    const candidates = await this.db.financialInvoice.findMany({
      where: {
        bankTransactionId: null,
        currency: movement.import.account.currency,
        amount: signed,
        date: {
          gte: new Date(movement.date.getTime() - 90 * 86400000),
          lte: new Date(movement.date.getTime() + 7 * 86400000),
        },
      },
      orderBy: [{ date: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    const normalize = (v: string) =>
      v
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
    const description = normalize(
      movement.description + ' ' + movement.reference,
    );
    return candidates
      .map((invoice) => {
        const days =
          Math.abs(movement.date.getTime() - invoice.date.getTime()) / 86400000;
        const reference =
          (normalize(invoice.number).length >= 3 &&
            description.includes(normalize(invoice.number))) ||
          description.includes(invoice.issuerTaxId);
        const name = normalize(invoice.issuerName);
        const issuer = name.length >= 5 && description.includes(name);
        return {
          ...invoice,
          score: reference
            ? 95
            : issuer && days <= 7
              ? 85
              : days <= 3
                ? 70
                : 50,
          reasons: [
            'Valor e moeda iguais',
            `Diferença de ${days} dias`,
            ...(reference ? ['Referência/NIF no movimento'] : []),
            ...(issuer ? ['Emitente na descrição'] : []),
          ],
        };
      })
      .sort((a, b) => b.score - a.score);
  }
  async associate(id: string, movementId: string | null, user: CurrentUser) {
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(71932002)`;
      const invoice = await tx.financialInvoice.findUnique({ where: { id } });
      if (!invoice) throw new NotFoundException();
      if (
        invoice.bankTransactionId &&
        movementId &&
        invoice.bankTransactionId !== movementId
      )
        throw new ConflictException(
          'Fatura já associada; remova o vínculo anterior primeiro',
        );
      if (movementId) {
        const movement = await tx.bankTransaction.findUnique({
          where: { id: movementId },
          include: { import: { include: { account: true } } },
        });
        if (!movement) throw new NotFoundException();
        if (movement.status === 'REJECTED')
          throw new BadRequestException('Movimento ignorado');
        if (
          movement.import.account.currency !== invoice.currency ||
          (movement.direction === 'DEBIT') !== invoice.amount.isPositive()
        )
          throw new BadRequestException(
            'Moeda ou direção incompatível com a fatura',
          );
      }
      return tx.financialInvoice.update({
        where: { id },
        data: {
          bankTransactionId: movementId,
          associatedBy: user.id,
          associatedAt: new Date(),
        },
      });
    });
  }
  async original(id: string, user: CurrentUser) {
    const imported = await this.db.invoiceImport.findUnique({ where: { id } });
    if (!imported) throw new NotFoundException();
    const buffer = await this.storage.get(imported.storageKey);
    await this.db.auditLog.create({
      data: {
        ...auditRequestFields(),
        userId: user.id,
        action: 'FINANCE_INVOICE_DOWNLOAD',
        entity: 'InvoiceImport',
        entityId: id,
      },
    });
    return { buffer, filename: imported.filename };
  }
}
