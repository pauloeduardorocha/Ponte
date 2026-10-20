import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrentUser } from '@church/shared';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { PrivateUpload, StorageService } from '../finance/storage.service';
import { auditRequestFields, bindAudit } from '../audit/audit-context';
import { ReimbursementDto, ReimbursementQuery } from './reimbursements.dto';

const include = {
  attachments: {
    select: { id: true, filename: true, mime: true, size: true, kind: true },
    orderBy: { createdAt: 'asc' as const },
  },
  bankTransaction: {
    select: { id: true, date: true, amount: true, description: true },
  },
};
type RecordWithFiles = Prisma.ReimbursementGetPayload<{
  include: typeof include;
}>;
export function reimbursementStatus(row: {
  bankTransactionId: string | null;
  paidAt: Date | null;
  beneficiaryName: string;
  iban: string;
  purpose: string;
  amount: Prisma.Decimal | null;
  attachments: { kind: string }[];
}) {
  if (row.bankTransactionId) return 'LINKED';
  if (row.paidAt) return 'PAID';
  return row.beneficiaryName.trim() &&
    row.iban.trim() &&
    row.purpose.trim() &&
    row.amount?.gt(0) &&
    row.attachments.some((f) => f.kind === 'DOCUMENT')
    ? 'READY'
    : 'INCOMPLETE';
}
@Injectable()
export class ReimbursementsService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
  ) {}
  async profile(user: CurrentUser) {
    return this.db.member.findFirst({
      where: { user: { id: user.id }, anonymizedAt: null },
      select: { name: true, iban: true },
    });
  }
  private async saveMemberIban(
    tx: Prisma.TransactionClient,
    row: { beneficiaryName: string; iban: string; submittedBy: string | null },
    user?: CurrentUser,
  ) {
    if (!user || row.submittedBy !== user.id || !row.iban) return;
    const member = await tx.member.findFirst({
      where: { user: { id: user.id }, anonymizedAt: null },
      select: { id: true, name: true },
    });
    if (
      !member ||
      member.name.trim().toLocaleLowerCase() !==
        row.beneficiaryName.trim().toLocaleLowerCase()
    )
      return;
    await tx.member.updateMany({
      where: {
        id: member.id,
        anonymizedAt: null,
        OR: [{ iban: null }, { iban: '' }],
      },
      data: { iban: row.iban },
    });
  }
  private view(row: RecordWithFiles) {
    return { ...row, status: reimbursementStatus(row) };
  }
  private manager(user: CurrentUser) {
    return (
      user.permissions.includes('FINANCE_TRANSACTION_READ') &&
      user.permissions.includes('FINANCE_TRANSACTION_UPDATE')
    );
  }
  private async accessible(
    id: string,
    user: CurrentUser,
    allowDeleted = false,
  ) {
    const row = await this.db.reimbursement.findUnique({
      where: { id },
      include,
    });
    if (
      !row ||
      (!allowDeleted && row.deletedAt) ||
      (!this.manager(user) && row.submittedBy !== user.id)
    )
      throw new NotFoundException();
    return row;
  }
  async detail(id: string, user: CurrentUser) {
    return this.view(await this.accessible(id, user, true));
  }
  async remove(id: string, user: CurrentUser) {
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$queryRaw`SELECT id FROM reimbursements WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.reimbursement.findUnique({ where: { id } });
      if (!row || (!this.manager(user) && row.submittedBy !== user.id))
        throw new NotFoundException();
      if (row.deletedAt) return { id };
      await tx.reimbursement.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.audit(tx, 'DELETE', id, user);
      return { id };
    });
  }
  private async audit(
    tx: Prisma.TransactionClient,
    action: string,
    id: string,
    user?: CurrentUser,
  ) {
    await tx.auditLog.create({
      data: {
        ...auditRequestFields(),
        userId: user?.id,
        action: 'REIMBURSEMENT_' + action,
        entity: 'Reimbursement',
        entityId: id,
      },
    });
  }
  async list(q: ReimbursementQuery, user: CurrentUser, mine = false) {
    const ready: Prisma.ReimbursementWhereInput = {
      beneficiaryName: { not: '' },
      iban: { not: '' },
      purpose: { not: '' },
      amount: { gt: 0 },
      attachments: { some: { kind: 'DOCUMENT' } },
    };
    const status: Prisma.ReimbursementWhereInput =
      q.status === 'LINKED'
        ? { bankTransactionId: { not: null } }
        : q.status === 'PAID'
          ? { bankTransactionId: null, paidAt: { not: null } }
          : q.status === 'READY'
            ? { bankTransactionId: null, paidAt: null, ...ready }
            : q.status === 'INCOMPLETE'
              ? { bankTransactionId: null, paidAt: null, NOT: ready }
              : {};
    const where: Prisma.ReimbursementWhereInput = {
      deletedAt: null,
      ...(!this.manager(user) || mine ? { submittedBy: user.id } : {}),
      ...status,
      ...(q.search
        ? {
            OR: ['beneficiaryName', 'purpose', 'iban'].map((field) => ({
              [field]: { contains: q.search, mode: 'insensitive' },
            })),
          }
        : {}),
    };
    const page = q.page ?? 1,
      pageSize = q.pageSize ?? 25;
    const [rows, total] = await Promise.all([
      this.db.reimbursement.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.reimbursement.count({ where }),
    ]);
    return { items: rows.map((row) => this.view(row)), total, page, pageSize };
  }
  async create(
    dto: ReimbursementDto,
    files: PrivateUpload[],
    user?: CurrentUser,
  ) {
    if (!files?.length)
      throw new BadRequestException('Anexe pelo menos um documento da despesa');
    files.forEach((file) => this.validate(file));
    const keys: string[] = [];
    try {
      for (const file of files) keys.push(await this.storage.put(file));
      const hashes = files.map((file) =>
        createHash('sha256').update(file.buffer).digest('hex'),
      );
      const duplicate =
        user && this.manager(user)
          ? (await this.db.reimbursementAttachment.count({
              where: { hash: { in: hashes } },
            })) > 0
          : false;
      const row = await this.db.$transaction(async (tx) => {
        await bindAudit(tx);
        const saved = await tx.reimbursement.create({
          data: {
            ...this.fields(dto),
            submittedBy: user?.id,
            attachments: {
              create: files.map((file, i) => ({
                storageKey: keys[i]!,
                filename: file.originalname,
                mime: file.mimetype,
                size: file.size,
                hash: hashes[i]!,
              })),
            },
          },
          include,
        });
        await this.saveMemberIban(tx, saved, user);
        await this.audit(tx, 'CREATE', saved.id, user);
        return saved;
      });
      // Anonymous submissions receive only a receipt, never private records.
      return user
        ? { ...this.view(row), possibleDuplicate: duplicate }
        : { id: row.id };
    } catch (error) {
      await Promise.allSettled(keys.map((key) => this.storage.remove(key)));
      throw error;
    }
  }
  private fields(dto: ReimbursementDto) {
    if (
      dto.amount !== undefined &&
      (!dto.amount || !new Prisma.Decimal(dto.amount).gt(0))
    )
      throw new BadRequestException('O valor deve ser positivo');
    return {
      beneficiaryName: dto.beneficiaryName?.trim(),
      iban: dto.iban?.trim(),
      purpose: dto.purpose?.trim(),
      amount: dto.amount,
    };
  }
  async update(id: string, dto: ReimbursementDto, user: CurrentUser) {
    await this.accessible(id, user);
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$queryRaw`SELECT id FROM reimbursements WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.reimbursement.findUniqueOrThrow({ where: { id } });
      if (row.deletedAt) throw new NotFoundException('Pedido excluído');
      if (row.paidAt || row.bankTransactionId)
        throw new ConflictException('Um pedido pago não pode ser alterado');
      const saved = await tx.reimbursement.update({
        where: { id },
        data: this.fields(dto),
        include,
      });
      await this.saveMemberIban(tx, saved, user);
      await this.audit(tx, 'UPDATE', id, user);
      return this.view(saved);
    });
  }
  private validate(file: PrivateUpload) {
    if (!file || file.size > 2 * 1024 * 1024)
      throw new BadRequestException(
        'O documento preparado para envio deve ter até 2 MB',
      );
    this.storage.validate(file);
  }
  async attach(
    id: string,
    file: PrivateUpload,
    kind: string,
    user: CurrentUser,
  ) {
    await this.accessible(id, user);
    if (kind === 'PAYMENT' && !this.manager(user))
      throw new ForbiddenException();
    this.validate(file);
    const key = await this.storage.put(file);
    try {
      return await this.db.$transaction(async (tx) => {
        await bindAudit(tx);
        await tx.$queryRaw`SELECT id FROM reimbursements WHERE id = ${id}::uuid FOR UPDATE`;
        const row = await tx.reimbursement.findUniqueOrThrow({
          where: { id },
          include,
        });
        if (row.deletedAt) throw new NotFoundException('Pedido excluído');
        if (!this.manager(user) && (row.paidAt || row.bankTransactionId))
          throw new ConflictException('O pedido já foi pago');
        if (row.attachments.length >= 10)
          throw new BadRequestException('Máximo de 10 documentos por pedido');
        await tx.reimbursementAttachment.create({
          data: {
            reimbursementId: id,
            storageKey: key,
            filename: file.originalname,
            mime: file.mimetype,
            size: file.size,
            kind,
            hash: createHash('sha256').update(file.buffer).digest('hex'),
          },
        });
        await this.audit(tx, 'ATTACH', id, user);
        return { id };
      });
    } catch (error) {
      await this.storage.remove(key);
      throw error;
    }
  }
  async pay(id: string, paidAt: string, user: CurrentUser) {
    if (new Date(paidAt) > new Date())
      throw new BadRequestException('A data do pagamento não pode ser futura');
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$queryRaw`SELECT id FROM reimbursements WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.reimbursement.findUnique({ where: { id }, include });
      if (!row || row.deletedAt) throw new NotFoundException();
      if (reimbursementStatus(row) !== 'READY')
        throw new ConflictException(
          'Complete o pedido antes de registar o pagamento',
        );
      const saved = await tx.reimbursement.update({
        where: { id },
        data: { paidAt: new Date(paidAt) },
        include,
      });
      await this.audit(tx, 'PAY', id, user);
      return this.view(saved);
    });
  }
  async suggestions(id: string) {
    const row = await this.db.reimbursement.findUnique({ where: { id } });
    if (!row || row.deletedAt) throw new NotFoundException();
    if (!row.paidAt || !row.amount || row.bankTransactionId) return [];
    const start = new Date(row.paidAt),
      end = new Date(row.paidAt);
    start.setUTCDate(start.getUTCDate() - 7);
    end.setUTCDate(end.getUTCDate() + 30);
    return this.db.bankTransaction.findMany({
      where: {
        direction: 'DEBIT',
        amount: row.amount,
        date: { gte: start, lte: end },
        status: { notIn: ['REJECTED', 'POSSIBLE_DUPLICATE'] },
        OR: [{ classification: null }, { classification: 'EXPENSE' }],
        reimbursement: null,
        import: {
          status: { in: ['READY_FOR_REVIEW', 'CONFIRMED'] },
          account: { currency: row.currency },
        },
      },
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        reference: true,
      },
      orderBy: { date: 'desc' },
      take: 30,
    });
  }
  async link(id: string, transactionId: string, user: CurrentUser) {
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${transactionId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM reimbursements WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.reimbursement.findUnique({ where: { id } });
      const movement = await tx.bankTransaction.findUnique({
        where: { id: transactionId },
        include: {
          reimbursement: true,
          import: { include: { account: true } },
        },
      });
      if (!row || row.deletedAt || !movement) throw new NotFoundException();
      if (row.bankTransactionId || movement.reimbursement)
        throw new ConflictException('O pedido ou movimento já está associado');
      if (
        !row.paidAt ||
        !row.amount ||
        movement.direction !== 'DEBIT' ||
        !movement.amount.equals(row.amount) ||
        movement.import.account.currency !== row.currency ||
        ['REJECTED', 'POSSIBLE_DUPLICATE'].includes(movement.status) ||
        movement.classification === 'IGNORE' ||
        !['READY_FOR_REVIEW', 'CONFIRMED'].includes(movement.import.status)
      )
        throw new BadRequestException(
          'Selecione uma saída bancária na mesma moeda e com o valor exato do pedido pago',
        );
      const saved = await tx.reimbursement.update({
        where: { id },
        data: { bankTransactionId: transactionId },
        include,
      });
      await this.audit(tx, 'LINK', id, user);
      return this.view(saved);
    });
  }
  async unlink(id: string, user: CurrentUser) {
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$queryRaw`SELECT id FROM reimbursements WHERE id = ${id}::uuid FOR UPDATE`;
      const existing = await tx.reimbursement.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) throw new NotFoundException();
      const row = await tx.reimbursement.update({
        where: { id },
        data: { bankTransactionId: null },
        include,
      });
      await this.audit(tx, 'UNLINK', id, user);
      return this.view(row);
    });
  }
  async download(id: string, attachmentId: string, user: CurrentUser) {
    const row = await this.db.reimbursement.findUnique({ where: { id } });
    if (
      !row ||
      !(
        this.manager(user) ||
        row.submittedBy === user.id ||
        (row.bankTransactionId &&
          user.permissions.includes('FINANCE_BANK_IMPORT') &&
          user.permissions.includes('FINANCE_CONTRIBUTION_READ'))
      )
    )
      throw new NotFoundException();
    const file = await this.db.reimbursementAttachment.findFirst({
      where: { id: attachmentId, reimbursementId: id },
    });
    if (!file) throw new NotFoundException();
    const buffer = await this.storage.get(file.storageKey);
    await this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await this.audit(tx, 'DOWNLOAD', id, user);
    });
    return { ...file, buffer };
  }
  async forMovement(transactionId: string) {
    const row = await this.db.reimbursement.findUnique({
      where: { bankTransactionId: transactionId },
      include,
    });
    return row ? this.view(row) : null;
  }
  async movementSuggestions(transactionId: string) {
    const movement = await this.db.bankTransaction.findUnique({
      where: { id: transactionId },
      include: { reimbursement: true, import: { include: { account: true } } },
    });
    if (!movement) throw new NotFoundException();
    if (
      movement.direction !== 'DEBIT' ||
      movement.reimbursement ||
      movement.classification === 'IGNORE' ||
      ['REJECTED', 'POSSIBLE_DUPLICATE'].includes(movement.status)
    )
      return [];
    const start = new Date(movement.date),
      end = new Date(movement.date);
    start.setUTCDate(start.getUTCDate() - 30);
    end.setUTCDate(end.getUTCDate() + 7);
    const rows = await this.db.reimbursement.findMany({
      where: {
        deletedAt: null,
        bankTransactionId: null,
        paidAt: { gte: start, lte: end },
        amount: movement.amount,
        currency: movement.import.account.currency,
      },
      include,
      orderBy: { paidAt: 'desc' },
      take: 20,
    });
    return rows.map((row) => this.view(row));
  }
  async undoPayment(id: string, user: CurrentUser) {
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$queryRaw`SELECT id FROM reimbursements WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.reimbursement.findUnique({ where: { id } });
      if (!row || row.deletedAt) throw new NotFoundException();
      if (row.bankTransactionId)
        throw new ConflictException('Desfaça primeiro a associação bancária');
      const saved = await tx.reimbursement.update({
        where: { id },
        data: { paidAt: null },
        include,
      });
      await this.audit(tx, 'UNDO_PAYMENT', id, user);
      return this.view(saved);
    });
  }
}
