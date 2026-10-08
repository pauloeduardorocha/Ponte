import { bindAudit, auditRequestFields } from '../audit/audit-context';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BankTransaction, BankReconciliation, Prisma } from '@prisma/client';
import type { CurrentUser } from '@church/shared';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { StorageService, PrivateUpload } from '../finance/storage.service';
import {
  BankQuery,
  ClassifyBankDto,
  LinkBankDto,
  ReconcileBankDto,
  UndoBankDto,
} from './banking.dto';
import {
  canonical,
  ParsedBankTransaction,
  StatementParserRegistry,
  transactionFingerprint,
} from './statement.parsers';
type Tx = Prisma.TransactionClient;
@Injectable()
export class BankingService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
    private readonly registry: StatementParserRegistry,
  ) {}
  private async audit(
    tx: Tx,
    user: CurrentUser,
    action: string,
    id: string,
    metadata: Prisma.InputJsonValue = {},
  ) {
    await tx.auditLog.create({
      data: {
        ...auditRequestFields(),
        userId: user.id,
        action: 'FINANCE_BANK_' + action,
        entity: [
          'UPLOAD',
          'PROCESSING',
          'READY_FOR_REVIEW',
          'FAILED',
          'CONFIRM',
          'FILE_DOWNLOAD',
        ].includes(action)
          ? 'BankImport'
          : 'BankTransaction',
        entityId: id,
        metadata,
      },
    });
  }
  private async transaction<T>(fn: (tx: Tx) => Promise<T>) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await bindAudit(tx);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(71932002)`;
          return fn(tx);
        },
        { timeout: 30000 },
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') throw new NotFoundException();
        if (['P2002', 'P2003'].includes(e.code))
          throw new ConflictException('Vínculo inválido ou já conciliado');
      }
      throw e;
    }
  }
  private memberAccess(user: CurrentUser) {
    if (!user.permissions.includes('FINANCE_CONTRIBUTION_READ'))
      throw new ForbiddenException('Permissão de contribuições necessária');
  }
  async upload(accountId: string, file: PrivateUpload, user: CurrentUser) {
    const { parser, format } = this.registry.identify(file);
    const account = await this.db.bankAccount.findUnique({
      where: { id: accountId },
    });
    if (account?.status !== 'ACTIVE')
      throw new BadRequestException('Escolha uma conta ativa');
    const storageKey = await this.storage.putValidated(file);
    let imported;
    try {
      imported = await this.transaction(async (tx) => {
        await bindAudit(tx);
        const i = await tx.bankImport.create({
          data: {
            accountId,
            filename: file.originalname.replace(/^.*[\\/]/, ''),
            storageKey,
            format,
            mime: file.mimetype,
            size: file.size,
            fileHash: createHash('sha256').update(file.buffer).digest('hex'),
            uploadedBy: user.id,
            status: 'UPLOADED',
          },
        });
        await this.audit(tx, user, 'UPLOAD', i.id, {
          filename: i.filename,
          accountId,
        });
        return i;
      });
    } catch (e) {
      await this.storage.remove(storageKey);
      throw e;
    }
    await this.transaction(async (tx) => {
      await bindAudit(tx);
      await tx.bankImport.update({
        where: { id: imported.id },
        data: { status: 'PROCESSING' },
      });
      await this.audit(tx, user, 'PROCESSING', imported.id);
    });
    let parsed: ParsedBankTransaction[];
    try {
      parsed = await parser.parse(file);
      for (const row of parsed) {
        if (row.currency && row.currency !== account.currency)
          throw new Error(`Linha ${row.rowNumber}: moeda diferente da conta`);
        const number = account.account ?? account.iban;
        if (
          row.account &&
          number &&
          canonical(row.account) !== canonical(number)
        )
          throw new Error(
            `Linha ${row.rowNumber}: conta bancária diferente da selecionada`,
          );
      }
    } catch (e) {
      await this.transaction(async (tx) => {
        await bindAudit(tx);
        await tx.bankImport.update({
          where: { id: imported.id },
          data: {
            status: 'FAILED',
            error: (e as Error).message.slice(0, 2000),
          },
        });
        await this.audit(tx, user, 'FAILED', imported.id);
      });
      return this.importDetail(imported.id);
    }
    try {
      await this.transaction(async (tx) => {
        await bindAudit(tx);
        const currentAccount = await tx.bankAccount.findUniqueOrThrow({
          where: { id: accountId },
        });
        if (currentAccount.status !== 'ACTIVE')
          throw new BadRequestException(
            'Conta desativada durante processamento',
          );
        const existing = await tx.bankTransaction.findMany({
          where: {
            import: { accountId },
            date: {
              in: [...new Set(parsed.map((r) => r.date))].map(
                (d) => new Date(d),
              ),
            },
          },
          select: {
            id: true,
            date: true,
            amount: true,
            direction: true,
            reference: true,
            bankIdentifier: true,
            fingerprint: true,
          },
        });
        const defaultCategories = {
          INCOME: await this.uncategorized(tx, 'INCOME'),
          EXPENSE: await this.uncategorized(tx, 'EXPENSE'),
        };
        const ledgerWhere = {
          accountId,
          bankTransactionId: null,
          status: 'COMPLETED' as const,
          date: {
            in: [...new Set(parsed.map((r) => r.date))].map((d) => new Date(d)),
          },
        };
        const manualIncomes = await tx.income.findMany({
          where: ledgerWhere,
          select: { id: true, amount: true, date: true },
        });
        const manualExpenses = await tx.expense.findMany({
          where: ledgerWhere,
          select: { id: true, amount: true, date: true },
        });
        const repeatedFile = await tx.bankImport.findFirst({
          where: {
            accountId,
            fileHash: imported.fileHash,
            status: 'CONFIRMED',
            id: { not: imported.id },
          },
        });
        for (const row of parsed) {
          const fingerprint = transactionFingerprint(accountId, row);
          const dup = existing.find(
            (t) =>
              t.fingerprint === fingerprint ||
              (t.date.toISOString().slice(0, 10) === row.date &&
                t.amount.abs().equals(row.amount) &&
                t.direction === row.direction &&
                ((!row.reference && !row.bankIdentifier) ||
                  (row.bankIdentifier &&
                    canonical(t.bankIdentifier ?? '') ===
                      canonical(row.bankIdentifier)) ||
                  (row.reference &&
                    canonical(t.reference) === canonical(row.reference)))),
          );
          const confirmedDuplicate = Boolean(
            dup &&
            (repeatedFile ||
              (row.bankIdentifier &&
                canonical(dup.bankIdentifier ?? '') ===
                  canonical(row.bankIdentifier))),
          );
          const manualMatch = (
            row.direction === 'CREDIT' ? manualIncomes : manualExpenses
          ).find(
            (entry) =>
              entry.date.toISOString().slice(0, 10) === row.date &&
              entry.amount.equals(row.amount),
          );
          const created = await tx.bankTransaction.create({
            data: {
              importId: imported.id,
              amount: row.amount,
              date: new Date(row.date),
              direction: row.direction,
              description: row.description,
              reference: row.reference,
              bankIdentifier: row.bankIdentifier,
              fingerprint,
              rowNumber: row.rowNumber,
              status: confirmedDuplicate
                ? 'REJECTED'
                : dup || manualMatch
                  ? 'POSSIBLE_DUPLICATE'
                  : 'CLASSIFIED',
              classification: row.direction === 'CREDIT' ? 'INCOME' : 'EXPENSE',
              categoryId:
                defaultCategories[
                  row.direction === 'CREDIT' ? 'INCOME' : 'EXPENSE'
                ].id,
              duplicateReason: dup
                ? `${confirmedDuplicate ? 'Duplicado ignorado' : 'Possível correspondência'} com movimento ${dup.id}`
                : manualMatch
                  ? `Possível correspondência com ${row.direction === 'CREDIT' ? 'receita' : 'despesa'} já cadastrada ${manualMatch.id}`
                  : null,
            },
          });
          existing.push(created);
          if (!dup && !manualMatch)
            await this.registerMovement(tx, created, accountId, user);
        }
        await tx.bankImport.update({
          where: { id: imported.id },
          data: {
            status: 'CONFIRMED',
            confirmedBy: user.id,
            confirmedAt: new Date(),
          },
        });
        await this.audit(tx, user, 'CONFIRM', imported.id, {
          rows: parsed.length,
        });
      });
    } catch (e) {
      await this.transaction(async (tx) => {
        await bindAudit(tx);
        await tx.bankImport.update({
          where: { id: imported.id },
          data: {
            status: 'FAILED',
            error:
              'Falha ao persistir movimentos. Envie novamente após verificar a conta.',
          },
        });
        await this.audit(tx, user, 'FAILED', imported.id);
      });
      throw e;
    }
    return this.importDetail(imported.id);
  }
  private uncategorized(tx: Tx, kind: 'INCOME' | 'EXPENSE') {
    const id =
      kind === 'INCOME'
        ? '00000000-0000-4000-8000-000000000001'
        : '00000000-0000-4000-8000-000000000002';
    return tx.financialCategory.upsert({
      where: { id },
      update: {},
      create: { id, name: 'Sem categoria', kind },
    });
  }
  private async registerMovement(
    tx: Tx,
    row: BankTransaction,
    accountId: string,
    user: CurrentUser,
  ) {
    const common = {
      amount: row.amount,
      date: row.date,
      accountId,
      categoryId: row.categoryId!,
      description: row.description,
      status: 'COMPLETED' as const,
      bankTransactionId: row.id,
    };
    const income =
      row.direction === 'CREDIT'
        ? await tx.income.create({
            data: {
              ...common,
              origin: 'BANK_IMPORT',
              reference: row.reference,
              memberId: row.memberId,
            },
          })
        : null;
    const expense =
      row.direction === 'DEBIT'
        ? await tx.expense.create({
            data: {
              ...common,
              dueDate: row.date,
              paidAt: row.date,
              supplierId: row.supplierId,
            },
          })
        : null;
    if (income && row.memberId && row.contributionType) {
      await tx.contribution.create({
        data: {
          incomeId: income.id,
          memberId: row.memberId,
          type: row.contributionType,
        },
      });
    }
    await tx.bankReconciliation.create({
      data: {
        bankTransactionId: row.id,
        incomeId: income?.id,
        expenseId: expense?.id,
        createdLedger: true,
        reconciledBy: user.id,
      },
    });
    await tx.bankTransaction.update({
      where: { id: row.id },
      data: { status: 'RECONCILED' },
    });
    await this.audit(tx, user, 'REGISTER', row.id, {
      incomeId: income?.id ?? null,
      expenseId: expense?.id ?? null,
    });
  }
  async imports(q: BankQuery) {
    const where = { accountId: q.accountId };
    return {
      items: await this.db.bankImport.findMany({
        where,
        select: {
          id: true,
          accountId: true,
          account: { select: { name: true } },
          filename: true,
          status: true,
          format: true,
          createdAt: true,
          error: true,
          confirmedAt: true,
          uploadedBy: true,
          _count: { select: { transactions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      total: await this.db.bankImport.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async importDetail(id: string) {
    const i = await this.db.bankImport.findUnique({
      where: { id },
      select: {
        id: true,
        accountId: true,
        filename: true,
        status: true,
        format: true,
        size: true,
        createdAt: true,
        error: true,
        confirmedAt: true,
        confirmedBy: true,
        uploadedBy: true,
        _count: { select: { transactions: true } },
        account: { select: { name: true, currency: true } },
      },
    });
    if (!i) throw new NotFoundException();
    const range = await this.db.bankTransaction.aggregate({
      where: { importId: id },
      _min: { date: true },
      _max: { date: true },
    });
    const statuses = await this.db.bankTransaction.groupBy({
      by: ['status'],
      where: { importId: id },
      _count: { _all: true },
    });
    const count = (status: string) =>
      statuses.find((entry) => entry.status === status)?._count._all ?? 0;
    return {
      ...i,
      summary: {
        registered: count('RECONCILED'),
        ignored: count('REJECTED'),
        pending:
          count('PENDING_REVIEW') +
          count('CLASSIFIED') +
          count('POSSIBLE_DUPLICATE'),
      },
      period: {
        start: range._min.date?.toISOString().slice(0, 10) ?? null,
        end: range._max.date?.toISOString().slice(0, 10) ?? null,
      },
    };
  }
  async movements(q: BankQuery, user: CurrentUser) {
    const where: Prisma.BankTransactionWhereInput = {
      id: q.transactionId,
      direction: q.direction,
      categoryId: q.categoryId,
      date: {
        gte: q.start ? new Date(q.start) : undefined,
        lte: q.end ? new Date(q.end) : undefined,
      },
      ...(q.search
        ? {
            OR: [
              {
                description: {
                  contains: q.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                reference: { contains: q.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
      importId: q.importId,
      import: { accountId: q.accountId },
      status:
        q.transactionStatus ??
        (q.unreconciled === 'true' ? { not: 'RECONCILED' } : undefined),
    };
    const items = await this.db.bankTransaction.findMany({
      where,
      include: {
        import: {
          select: {
            id: true,
            filename: true,
            status: true,
            accountId: true,
            account: { select: { currency: true } },
          },
        },
        invoices: user.permissions.includes('FINANCE_INVOICE_READ'),
        reconciliations: {
          orderBy: { reconciledAt: 'desc' },
          include: {
            income: { include: { contribution: true } },
            expense: true,
          },
        },
      },
      orderBy: [{ date: 'desc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    });
    const categories = await this.db.financialCategory.findMany({
      where: {
        id: { in: items.flatMap((t) => (t.categoryId ? [t.categoryId] : [])) },
      },
      select: { id: true, name: true },
    });
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    return {
      items: items.map((item) => {
        const t = {
          ...item,
          category: categoryById.get(item.categoryId ?? '') ?? null,
        };
        return user.permissions.includes('FINANCE_CONTRIBUTION_READ')
          ? t
          : {
              ...t,
              memberId: undefined,
              associatedBy: undefined,
              associatedAt: undefined,
              contributionType: undefined,
              reconciliations: t.reconciliations.map((r) => ({
                ...r,
                income: r.income
                  ? {
                      id: r.income.id,
                      amount: r.income.amount,
                      status: r.income.status,
                    }
                  : null,
              })),
            };
      }),
      total: await this.db.bankTransaction.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async members(q: BankQuery) {
    const where = {
      status: 'ACTIVE' as const,
      name: q.search
        ? { contains: q.search, mode: 'insensitive' as const }
        : undefined,
    };
    return {
      items: await this.db.member.findMany({
        where,
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: q.pageSize,
        skip: (q.page - 1) * q.pageSize,
      }),
      total: await this.db.member.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async suggestions(id: string) {
    const t = await this.db.bankTransaction.findUniqueOrThrow({
      where: { id },
    });
    if (t.direction !== 'CREDIT') return [];
    const text = canonical(t.description + ' ' + t.reference);
    const members = await this.db.member.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
    });
    return members
      .map((m) => {
        const name = canonical(m.name);
        const tokens = m.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 2 && !['dos', 'das'].includes(w));
        const hit = tokens.filter((w) => text.includes(w)).length;
        const confidence =
          name.length > 5 && text.includes(name)
            ? 95
            : Math.round((hit / Math.max(tokens.length, 1)) * 80);
        return { ...m, confidence };
      })
      .filter((m) => m.confidence >= 50)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }
  async classify(dto: ClassifyBankDto, user: CurrentUser) {
    if (dto.memberId || dto.contributionType) {
      this.memberAccess(user);
      if (!user.permissions.includes('FINANCE_CONTRIBUTION_WRITE'))
        throw new ForbiddenException();
    }
    if (
      (dto.classification === 'INCOME' && dto.supplierId) ||
      (dto.classification === 'EXPENSE' &&
        (dto.memberId || dto.contributionType)) ||
      (dto.classification === 'IGNORE' &&
        (dto.memberId ||
          dto.contributionType ||
          dto.categoryId ||
          dto.supplierId)) ||
      (dto.contributionType && !dto.memberId)
    )
      throw new BadRequestException('Classificação incompatível');
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const rows = await tx.bankTransaction.findMany({
        where: { id: { in: dto.ids } },
        include: { import: true },
      });
      if (rows.length !== dto.ids.length) throw new NotFoundException();
      if (dto.classification !== 'IGNORE' && !dto.categoryId) {
        dto.categoryId = (await this.uncategorized(tx, dto.classification)).id;
      }
      if (dto.classification !== 'IGNORE') {
        const category = await tx.financialCategory.findUnique({
          where: {
            id: dto.categoryId ?? '00000000-0000-0000-0000-000000000000',
          },
        });
        if (category?.kind !== dto.classification)
          throw new BadRequestException('Escolha a categoria correta');
      }
      if (
        dto.memberId &&
        !(await tx.member.findFirst({
          where: { id: dto.memberId, status: 'ACTIVE' },
        }))
      )
        throw new BadRequestException('Membro inválido');
      if (
        dto.supplierId &&
        !(await tx.supplier.findUnique({ where: { id: dto.supplierId } }))
      )
        throw new BadRequestException('Fornecedor inválido');
      for (const row of rows) {
        if (
          dto.classification !== 'IGNORE' &&
          row.duplicateReason?.startsWith('Duplicado ignorado')
        ) {
          throw new ConflictException(
            'Este movimento já foi importado e não será cadastrado novamente.',
          );
        }
        if (!['READY_FOR_REVIEW', 'CONFIRMED'].includes(row.import.status))
          throw new ConflictException(
            'Movimento não pode ser classificado neste estado',
          );
        if (row.status === 'RECONCILED' && dto.classification === 'IGNORE') {
          throw new ConflictException(
            'Um registro já cadastrado não pode ser ignorado. Revise-o na lista de receitas ou despesas.',
          );
        }
        if (row.memberId) this.memberAccess(user);
        if (
          dto.classification !== 'IGNORE' &&
          row.status !== 'RECONCILED' &&
          Boolean(row.duplicateReason) &&
          !dto.acceptDuplicate
        )
          throw new ConflictException(
            'Revise a possível duplicidade e aceite explicitamente',
          );
        if (
          (dto.classification === 'INCOME' && row.direction !== 'CREDIT') ||
          (dto.classification === 'EXPENSE' && row.direction !== 'DEBIT')
        )
          throw new BadRequestException(
            'Classificação incompatível com débito/crédito',
          );
        const updated = await tx.bankTransaction.update({
          where: { id: row.id },
          data: {
            classification: dto.classification,
            status:
              row.status === 'RECONCILED'
                ? 'RECONCILED'
                : dto.classification === 'IGNORE'
                  ? 'REJECTED'
                  : 'CLASSIFIED',
            categoryId: dto.categoryId ?? null,
            memberId: dto.memberId ?? null,
            supplierId: dto.supplierId ?? null,
            contributionType: dto.contributionType ?? null,
            classifiedBy: user.id,
            associatedBy: dto.memberId ? user.id : null,
            associatedAt: dto.memberId ? new Date() : null,
            ...(row.duplicateReason
              ? {
                  duplicateReviewedBy: user.id,
                  duplicateReviewedAt: new Date(),
                }
              : {}),
          },
        });
        if (row.status === 'RECONCILED') {
          if (row.direction === 'CREDIT') {
            const income = await tx.income.findFirstOrThrow({
              where: { bankTransactionId: row.id, status: 'COMPLETED' },
              include: { contribution: true },
            });
            if (
              income.contribution &&
              (income.contribution.memberId !== updated.memberId ||
                income.contribution.type !== updated.contributionType)
            ) {
              throw new ConflictException(
                'Edite a contribuição na lista de contribuições.',
              );
            }
            await tx.income.update({
              where: { id: income.id },
              data: {
                categoryId: updated.categoryId!,
                memberId: updated.memberId,
              },
            });
            if (
              !income.contribution &&
              updated.memberId &&
              updated.contributionType
            ) {
              await tx.contribution.create({
                data: {
                  incomeId: income.id,
                  memberId: updated.memberId,
                  type: updated.contributionType,
                },
              });
            }
          } else {
            await tx.expense.updateMany({
              where: { bankTransactionId: row.id, status: 'COMPLETED' },
              data: {
                categoryId: updated.categoryId!,
                supplierId: updated.supplierId,
              },
            });
          }
        } else if (dto.classification !== 'IGNORE') {
          await this.registerMovement(tx, updated, row.import.accountId, user);
        }
        await this.audit(tx, user, 'CLASSIFY', row.id, {
          before: { status: row.status, memberId: row.memberId },
          classification: dto.classification,
          memberId: dto.memberId ?? null,
          acceptDuplicate: dto.acceptDuplicate ?? false,
        });
      }
      return { count: rows.length };
    });
  }
  linkExisting(id: string, dto: LinkBankDto, user: CurrentUser) {
    if (Boolean(dto.incomeId) === Boolean(dto.expenseId))
      throw new BadRequestException(
        'Escolha uma receita ou despesa existente.',
      );
    return this.transaction(async (tx) => {
      const row = await tx.bankTransaction.findUniqueOrThrow({
        where: { id },
        include: { import: { include: { account: true } } },
      });
      if (
        !['PENDING_REVIEW', 'POSSIBLE_DUPLICATE', 'CLASSIFIED'].includes(
          row.status,
        ) ||
        !['CONFIRMED', 'READY_FOR_REVIEW'].includes(row.import.status) ||
        row.import.account.status !== 'ACTIVE'
      ) {
        throw new ConflictException(
          'Este movimento não está disponível para vínculo.',
        );
      }
      if ((row.direction === 'CREDIT') !== Boolean(dto.incomeId))
        throw new BadRequestException(
          'Escolha um registro do mesmo tipo do movimento.',
        );
      const income = dto.incomeId
        ? await tx.income.findUniqueOrThrow({
            where: { id: dto.incomeId },
            include: { contribution: true },
          })
        : null;
      const expense = dto.expenseId
        ? await tx.expense.findUniqueOrThrow({ where: { id: dto.expenseId } })
        : null;
      const ledger = income ?? expense!;
      this.match(row, ledger, row.import.accountId);
      if (
        ledger.bankTransactionId ||
        (await tx.bankReconciliation.count({
          where: {
            active: true,
            OR: [
              {
                incomeId: dto.incomeId ?? undefined,
                expenseId: dto.expenseId ?? undefined,
              },
            ],
          },
        }))
      ) {
        throw new ConflictException('O registro financeiro já está vinculado.');
      }
      if (income)
        await tx.income.update({
          where: { id: income.id },
          data: { bankTransactionId: row.id },
        });
      if (expense)
        await tx.expense.update({
          where: { id: expense.id },
          data: { bankTransactionId: row.id },
        });
      await tx.bankTransaction.update({
        where: { id },
        data: {
          status: 'RECONCILED',
          classification: income ? 'INCOME' : 'EXPENSE',
          categoryId: ledger.categoryId,
          memberId: income?.memberId ?? null,
          supplierId: expense?.supplierId ?? null,
          contributionType: income?.contribution?.type ?? null,
          classifiedBy: user.id,
          duplicateReviewedBy: user.id,
          duplicateReviewedAt: new Date(),
          associatedBy: user.id,
          associatedAt: new Date(),
        },
      });
      await tx.bankReconciliation.create({
        data: {
          bankTransactionId: id,
          incomeId: income?.id,
          expenseId: expense?.id,
          createdLedger: false,
          reconciledBy: user.id,
        },
      });
      await this.audit(tx, user, 'LINK_EXISTING', id, {
        incomeId: income?.id ?? null,
        expenseId: expense?.id ?? null,
      });
      return { id };
    });
  }
  confirm(id: string, user: CurrentUser) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const i = await tx.bankImport.findUniqueOrThrow({ where: { id } });
      if (i.status === 'CONFIRMED') return { id, status: i.status };
      if (i.status !== 'READY_FOR_REVIEW')
        throw new ConflictException('Importação não está pronta');
      const remaining = await tx.bankTransaction.count({
        where: {
          importId: id,
          status: { in: ['PENDING_REVIEW', 'POSSIBLE_DUPLICATE'] },
        },
      });
      if (remaining)
        throw new ConflictException(
          'Classifique ou ignore todos os movimentos antes de confirmar',
        );
      await tx.bankImport.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmedBy: user.id,
          confirmedAt: new Date(),
        },
      });
      await this.audit(tx, user, 'CONFIRM', id);
      return { id, status: 'CONFIRMED' };
    });
  }
  async reconcile(dto: ReconcileBankDto, user: CurrentUser) {
    if (
      (dto.incomeId && dto.expenseId) ||
      ((dto.incomeId || dto.expenseId) && dto.ids.length !== 1)
    )
      throw new BadRequestException(
        'Vínculo existente exige um único movimento',
      );
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const rows = await tx.bankTransaction.findMany({
        where: { id: { in: dto.ids } },
        include: { import: { include: { account: true } } },
      });
      if (rows.length !== dto.ids.length) throw new NotFoundException();
      const results: BankReconciliation[] = [];
      for (const row of rows) {
        if (
          row.status !== 'CLASSIFIED' ||
          row.import.status !== 'CONFIRMED' ||
          row.import.account.status !== 'ACTIVE'
        )
          throw new ConflictException(
            'Confirme a importação e classifique antes de conciliar',
          );
        if (row.memberId) {
          this.memberAccess(user);
          if (
            row.contributionType &&
            !user.permissions.includes('FINANCE_CONTRIBUTION_WRITE')
          )
            throw new ForbiddenException();
        }
        const category = await tx.financialCategory.findUnique({
          where: { id: row.categoryId ?? '' },
        });
        if (category?.kind !== row.classification)
          throw new BadRequestException('Categoria inválida');
        let incomeId: string | null = null,
          expenseId: string | null = null;
        if (row.classification === 'INCOME') {
          if (dto.expenseId)
            throw new BadRequestException('Escolha uma receita');
          if (dto.incomeId) {
            const income = await tx.income.findUniqueOrThrow({
              where: { id: dto.incomeId },
              include: { contribution: true },
            });
            if (income.memberId) this.memberAccess(user);
            this.match(row, income, row.import.accountId);
            if (
              income.memberId !== row.memberId ||
              income.categoryId !== row.categoryId ||
              income.contribution?.type !== (row.contributionType ?? undefined)
            )
              throw new BadRequestException(
                'Membro, categoria ou contribuição incompatíveis',
              );
            if (
              (income.bankTransactionId &&
                income.bankTransactionId !== row.id) ||
              (await tx.bankReconciliation.count({
                where: { incomeId: income.id, active: true },
              }))
            )
              throw new ConflictException('Receita já vinculada');
            incomeId = income.id;
            await tx.income.update({
              where: { id: incomeId },
              data: { bankTransactionId: row.id },
            });
          } else {
            const income = await tx.income.create({
              data: {
                amount: row.amount,
                date: row.date,
                accountId: row.import.accountId,
                categoryId: row.categoryId!,
                description: row.description,
                origin: 'BANK_IMPORT',
                reference: row.reference,
                status: 'COMPLETED',
                memberId: row.memberId,
                bankTransactionId: row.id,
              },
            });
            incomeId = income.id;
            if (row.memberId && row.contributionType)
              await tx.contribution.create({
                data: {
                  incomeId,
                  memberId: row.memberId,
                  type: row.contributionType,
                },
              });
          }
        } else if (row.classification === 'EXPENSE') {
          if (dto.incomeId)
            throw new BadRequestException('Escolha uma despesa');
          if (dto.expenseId) {
            const expense = await tx.expense.findUniqueOrThrow({
              where: { id: dto.expenseId },
            });
            this.match(row, expense, row.import.accountId);
            if (
              expense.categoryId !== row.categoryId ||
              expense.supplierId !== row.supplierId
            )
              throw new BadRequestException(
                'Categoria ou fornecedor incompatíveis',
              );
            if (
              (expense.bankTransactionId &&
                expense.bankTransactionId !== row.id) ||
              (await tx.bankReconciliation.count({
                where: { expenseId: expense.id, active: true },
              }))
            )
              throw new ConflictException('Despesa já vinculada');
            expenseId = expense.id;
            await tx.expense.update({
              where: { id: expenseId },
              data: { bankTransactionId: row.id },
            });
          } else {
            const expense = await tx.expense.create({
              data: {
                amount: row.amount,
                date: row.date,
                dueDate: row.date,
                paidAt: row.date,
                categoryId: row.categoryId!,
                accountId: row.import.accountId,
                description: row.description,
                status: 'COMPLETED',
                supplierId: row.supplierId,
                bankTransactionId: row.id,
              },
            });
            expenseId = expense.id;
          }
        } else throw new BadRequestException('Movimento ignorado');
        const reconciliation = await tx.bankReconciliation.create({
          data: {
            bankTransactionId: row.id,
            incomeId,
            expenseId,
            createdLedger: !dto.incomeId && !dto.expenseId,
            reconciledBy: user.id,
          },
        });
        await tx.bankTransaction.update({
          where: { id: row.id },
          data: { status: 'RECONCILED' },
        });
        await this.audit(tx, user, 'RECONCILE', row.id, {
          reconciliationId: reconciliation.id,
          incomeId,
          expenseId,
          contributionType: row.contributionType,
        });
        results.push(reconciliation);
      }
      return { items: results };
    });
  }
  private match(
    row: BankTransaction,
    ledger: {
      amount: Prisma.Decimal;
      date: Date;
      accountId: string;
      status: string;
    },
    accountId: string,
  ) {
    if (
      !ledger.amount.equals(row.amount) ||
      ledger.date.getTime() !== row.date.getTime() ||
      ledger.accountId !== accountId ||
      ledger.status !== 'COMPLETED'
    )
      throw new BadRequestException(
        'Valor, data, conta e status do lançamento devem coincidir',
      );
  }
  undo(dto: UndoBankDto, user: CurrentUser) {
    if (!dto.reason.trim()) throw new BadRequestException('Informe o motivo');
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      for (const id of dto.ids) {
        const row = await tx.bankTransaction.findUniqueOrThrow({
          where: { id },
          include: {
            reconciliations: {
              where: { active: true },
              include: { income: true },
            },
          },
        });
        const rec = row.reconciliations[0];
        if (row.status !== 'RECONCILED' || !rec)
          throw new ConflictException('Movimento não conciliado');
        if (row.memberId || rec.income?.memberId) this.memberAccess(user);
        await tx.bankReconciliation.update({
          where: { id: rec.id },
          data: {
            active: false,
            undoneBy: user.id,
            undoneAt: new Date(),
            undoReason: dto.reason.trim(),
          },
        });
        if (rec.incomeId)
          await tx.income.update({
            where: { id: rec.incomeId },
            data: rec.createdLedger
              ? { status: 'CANCELLED' }
              : { bankTransactionId: null },
          });
        if (rec.expenseId)
          await tx.expense.update({
            where: { id: rec.expenseId },
            data: rec.createdLedger
              ? { status: 'CANCELLED', paidAt: null }
              : { bankTransactionId: null },
          });
        await tx.bankTransaction.update({
          where: { id },
          data: { status: 'CLASSIFIED' },
        });
        await this.audit(tx, user, 'UNDO', id, {
          reconciliationId: rec.id,
          reason: dto.reason.trim(),
        });
      }
      return { count: dto.ids.length };
    });
  }
  async download(id: string, user: CurrentUser) {
    const i = await this.db.bankImport.findUniqueOrThrow({ where: { id } });
    const buffer = await this.storage.get(i.storageKey);
    await this.audit(this.db, user, 'FILE_DOWNLOAD', id);
    return { buffer, filename: i.filename };
  }
}
