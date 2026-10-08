import { DashboardQuery } from './finance.dto';
import { bindAudit, auditRequestFields } from '../audit/audit-context';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, FinancialKind, Income } from '@prisma/client';
import type { CurrentUser } from '@church/shared';
import { PrismaService } from '../../database/prisma.service';
import { StorageService, PrivateUpload } from './storage.service';
import {
  AccountDto,
  AccountPatch,
  CategoryDto,
  CategoryPatch,
  ContributionDto,
  ContributionPatch,
  ExpenseDto,
  ExpensePatch,
  FinanceQuery,
  IncomeDto,
  IncomePatch,
  SupplierDto,
  SupplierPatch,
} from './finance.dto';
type Tx = Prisma.TransactionClient;
@Injectable()
export class FinanceService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
  ) {}
  async members(query: FinanceQuery) {
    const where = { anonymizedAt: null };
    const [items, total] = await this.db.$transaction([
      this.db.member.findMany({
        where,
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.member.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  private async mutation<T>(
    user: CurrentUser,
    entity: string,
    id: string | undefined,
    fn: (tx: Tx) => Promise<T>,
  ) {
    try {
      return await this.db.$transaction(async (tx) => {
        await bindAudit(tx);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(71932002)`;
        const result = await fn(tx);
        await tx.auditLog.create({
          data: {
            ...auditRequestFields(),
            userId: user.id,
            action: `FINANCE_${entity}_${id ? 'UPDATE' : 'CREATE'}`,
            entity: entity,
            entityId: id ?? (result as { id?: string }).id,
            metadata: {
              after: JSON.parse(
                JSON.stringify(result),
              ) as Prisma.InputJsonValue,
            },
          },
        });
        return result;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002')
          throw new ConflictException('Registro já vinculado');
        if (e.code === 'P2003')
          throw new BadRequestException('Referência inválida');
        if (e.code === 'P2025') throw new NotFoundException();
      }
      throw e;
    }
  }
  private contributionAccess(user: CurrentUser) {
    if (!user.permissions.includes('FINANCE_CONTRIBUTION_READ'))
      throw new ForbiddenException('Permissão de contribuições necessária');
  }
  private sanitizeIncome(
    income: Income & {
      account?: { currency: string };
      category?: { name: string };
    },
    user: CurrentUser,
  ) {
    if (user.permissions.includes('FINANCE_CONTRIBUTION_READ')) return income;
    return {
      id: income.id,
      amount: income.amount,
      date: income.date,
      categoryId: income.categoryId,
      accountId: income.accountId,
      status: income.status,
      description: 'Receita restrita',
      account: income.account,
      category: income.category,
    };
  }
  async categories(q: FinanceQuery) {
    const where = {
      name: q.search
        ? { contains: q.search, mode: 'insensitive' as const }
        : undefined,
    };
    return {
      items: await this.db.financialCategory.findMany({
        where,
        include: { parent: { select: { name: true } } },
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      total: await this.db.financialCategory.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  saveCategory(
    dto: CategoryDto | CategoryPatch,
    user: CurrentUser,
    id?: string,
  ) {
    return this.mutation(user, 'FinancialCategory', id, async (tx) => {
      await bindAudit(tx);
      const old = id
        ? await tx.financialCategory.findUniqueOrThrow({ where: { id } })
        : null;
      const kind = dto.kind ?? old!.kind;
      if (old && dto.kind && old.kind !== dto.kind)
        throw new BadRequestException('Tipo de categoria é imutável');
      let parentId = dto.parentId === undefined ? old?.parentId : dto.parentId;
      const seen = new Set(id ? [id] : []);
      while (parentId) {
        if (seen.has(parentId))
          throw new BadRequestException('Hierarquia cíclica');
        seen.add(parentId);
        const parent = await tx.financialCategory.findUnique({
          where: { id: parentId },
        });
        if (!parent || parent.kind !== kind)
          throw new BadRequestException('Categoria pai inválida');
        parentId = parent.parentId;
      }
      return id
        ? tx.financialCategory.update({ where: { id }, data: dto })
        : tx.financialCategory.create({ data: dto as CategoryDto });
    });
  }
  async accounts(q: FinanceQuery) {
    const where = {
      id: q.id,
      name: q.search
        ? { contains: q.search, mode: 'insensitive' as const }
        : undefined,
    };
    return {
      items: await this.db.bankAccount.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      total: await this.db.bankAccount.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  saveAccount(dto: AccountDto | AccountPatch, user: CurrentUser, id?: string) {
    return this.mutation(user, 'BankAccount', id, async (tx) => {
      await bindAudit(tx);
      if (
        id &&
        (dto.currency !== undefined || dto.openingBalance !== undefined)
      ) {
        const count =
          (await tx.income.count({ where: { accountId: id } })) +
          (await tx.expense.count({ where: { accountId: id } })) +
          (await tx.bankImport.count({ where: { accountId: id } }));
        if (count)
          throw new BadRequestException(
            'Moeda e saldo inicial bloqueados após movimentações',
          );
      }
      if (
        dto.currency &&
        !Intl.supportedValuesOf('currency').includes(dto.currency)
      )
        throw new BadRequestException('Moeda inválida');
      return id
        ? tx.bankAccount.update({ where: { id }, data: dto })
        : tx.bankAccount.create({ data: dto as AccountDto });
    });
  }
  async suppliers(q: FinanceQuery) {
    const where = {
      name: q.search
        ? { contains: q.search, mode: 'insensitive' as const }
        : undefined,
    };
    return {
      items: await this.db.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      total: await this.db.supplier.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  saveSupplier(
    dto: SupplierDto | SupplierPatch,
    user: CurrentUser,
    id?: string,
  ) {
    return this.mutation(user, 'Supplier', id, (tx) =>
      id
        ? tx.supplier.update({ where: { id }, data: dto })
        : tx.supplier.create({ data: dto as SupplierDto }),
    );
  }
  async incomes(q: FinanceQuery, user: CurrentUser) {
    if (q.search && !user.permissions.includes('FINANCE_CONTRIBUTION_READ'))
      throw new ForbiddenException(
        'Pesquisa por descrição exige acesso a contribuições',
      );
    const where = {
      id: q.id,
      accountId: q.accountId,
      categoryId: q.categoryId,
      status: q.status,
      date: {
        gte: q.start ? new Date(q.start) : undefined,
        lte: q.end ? new Date(q.end) : undefined,
      },
      ...(q.search
        ? { description: { contains: q.search, mode: 'insensitive' as const } }
        : {}),
    };
    return {
      items: (
        await this.db.income.findMany({
          where,
          include: {
            category: { select: { name: true } },
            account: { select: { currency: true } },
          },
          orderBy: [{ date: 'desc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        })
      ).map((i) => this.sanitizeIncome(i, user)),
      total: await this.db.income.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async expenses(q: FinanceQuery) {
    const where = {
      id: q.id,
      accountId: q.accountId,
      categoryId: q.categoryId,
      status: q.status,
      date: {
        gte: q.start ? new Date(q.start) : undefined,
        lte: q.end ? new Date(q.end) : undefined,
      },
      ...(q.search
        ? { description: { contains: q.search, mode: 'insensitive' as const } }
        : {}),
    };
    return {
      items: await this.db.expense.findMany({
        where,
        include: {
          category: { select: { name: true } },
          account: { select: { currency: true } },
        },
        orderBy: [{ date: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      total: await this.db.expense.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  private async validateTransaction(
    tx: Tx,
    data: {
      amount: Prisma.Decimal | string;
      categoryId: string;
      accountId: string;
    },
    kind: FinancialKind,
  ) {
    if (new Prisma.Decimal(data.amount).lte(0))
      throw new BadRequestException('Valor deve ser positivo');
    const category = await tx.financialCategory.findUnique({
      where: { id: data.categoryId },
    });
    const account = await tx.bankAccount.findUnique({
      where: { id: data.accountId },
    });
    if (category?.kind !== kind || account?.status !== 'ACTIVE')
      throw new BadRequestException('Categoria ou conta inválida');
  }
  private changedBankField(old: object, dto: object, key: string) {
    const before = (old as Record<string, unknown>)[key];
    const after = (dto as Record<string, unknown>)[key];
    if (after === undefined) return false;
    if (key === 'amount')
      return !new Prisma.Decimal(String(before)).equals(String(after));
    if (['date', 'paidAt'].includes(key)) {
      return (
        (before ? new Date(String(before)).getTime() : null) !==
        (after ? new Date(String(after)).getTime() : null)
      );
    }
    return before !== after;
  }
  async saveIncome(
    dto: IncomeDto | IncomePatch,
    user: CurrentUser,
    id?: string,
  ) {
    const result = await this.mutation(user, 'Income', id, async (tx) => {
      await bindAudit(tx);
      const old = id
        ? await tx.income.findUniqueOrThrow({
            where: { id },
            include: { contribution: true },
          })
        : null;
      if (dto.memberId || old?.memberId || old?.contribution)
        this.contributionAccess(user);
      const data = { ...old, ...dto };
      await this.validateTransaction(tx, data as IncomeDto, 'INCOME');
      if (
        data.memberId &&
        !(await tx.member.findUnique({ where: { id: data.memberId } }))
      )
        throw new BadRequestException('Membro inválido');
      if (old?.contribution && data.memberId !== old.contribution.memberId)
        throw new BadRequestException('Membro difere da contribuição');
      if (dto.bankTransactionId !== undefined)
        throw new BadRequestException(
          'A origem bancária é definida pela importação',
        );
      if (
        old?.bankTransactionId &&
        ['amount', 'date', 'accountId', 'status'].some((key) =>
          this.changedBankField(old, dto, key),
        )
      )
        throw new ConflictException(
          'Valor, data, conta e status vêm do extrato bancário e não podem ser alterados',
        );
      if (old?.bankTransactionId) {
        await tx.bankTransaction.update({
          where: { id: old.bankTransactionId },
          data: {
            categoryId: dto.categoryId,
            memberId: dto.memberId,
          },
        });
      }
      const input = { ...dto, date: dto.date ? new Date(dto.date) : undefined };
      return id
        ? tx.income.update({ where: { id }, data: input })
        : tx.income.create({
            data: input as Prisma.IncomeUncheckedCreateInput,
          });
    });
    return this.sanitizeIncome(result, user);
  }
  saveExpense(dto: ExpenseDto | ExpensePatch, user: CurrentUser, id?: string) {
    return this.mutation(user, 'Expense', id, async (tx) => {
      await bindAudit(tx);
      const old = id
        ? await tx.expense.findUniqueOrThrow({ where: { id } })
        : null;
      if (
        old?.bankTransactionId &&
        ['amount', 'date', 'accountId', 'status', 'paidAt'].some((key) =>
          this.changedBankField(old, dto, key),
        )
      )
        throw new ConflictException(
          'Valor, data, conta e pagamento vêm do extrato bancário e não podem ser alterados',
        );
      const data = { ...old, ...dto };
      await this.validateTransaction(tx, data as ExpenseDto, 'EXPENSE');
      if ((data.status === 'COMPLETED') !== Boolean(data.paidAt))
        throw new BadRequestException(
          'Despesa concluída exige pagamento; pendente/cancelada não pode ter pagamento',
        );
      if (old?.bankTransactionId) {
        await tx.bankTransaction.update({
          where: { id: old.bankTransactionId },
          data: {
            categoryId: dto.categoryId,
            supplierId: dto.supplierId,
          },
        });
      }
      const input = {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        paidAt:
          dto.paidAt === null
            ? null
            : dto.paidAt
              ? new Date(dto.paidAt)
              : undefined,
      };
      return id
        ? tx.expense.update({ where: { id }, data: input })
        : tx.expense.create({
            data: input as Prisma.ExpenseUncheckedCreateInput,
          });
    });
  }
  async contributions(q: FinanceQuery) {
    return {
      items: await this.db.contribution.findMany({
        where: {
          id: q.id,
          type: q.type,
          income: {
            accountId: q.accountId,
            date: {
              gte: q.start ? new Date(q.start) : undefined,
              lte: q.end ? new Date(q.end) : undefined,
            },
          },
        },
        include: {
          member: { select: { id: true, name: true } },
          income: {
            include: {
              bankTransaction: {
                include: {
                  import: {
                    select: { id: true, filename: true, createdAt: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      total: await this.db.contribution.count({
        where: {
          id: q.id,
          type: q.type,
          income: {
            accountId: q.accountId,
            date: {
              gte: q.start ? new Date(q.start) : undefined,
              lte: q.end ? new Date(q.end) : undefined,
            },
          },
        },
      }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  saveContribution(
    dto: ContributionDto | ContributionPatch,
    user: CurrentUser,
    id?: string,
  ) {
    return this.mutation(user, 'Contribution', id, async (tx) => {
      await bindAudit(tx);
      this.contributionAccess(user);
      const old = id
        ? await tx.contribution.findUniqueOrThrow({ where: { id } })
        : null;
      const data = { ...old, ...dto } as ContributionDto;
      if (old && dto.memberId && dto.memberId !== old.memberId)
        throw new BadRequestException('Membro da contribuição é imutável');
      if (old && dto.incomeId && dto.incomeId !== old.incomeId)
        throw new BadRequestException('Origem da contribuição é imutável');
      const income = await tx.income.findUniqueOrThrow({
        where: { id: data.incomeId },
      });
      if (income.memberId && income.memberId !== data.memberId)
        throw new BadRequestException('Membro incompatível');
      await tx.income.update({
        where: { id: income.id },
        data: { memberId: data.memberId },
      });
      if (income.bankTransactionId) {
        await tx.bankTransaction.update({
          where: { id: income.bankTransactionId },
          data: {
            memberId: data.memberId,
            contributionType: data.type,
            associatedBy: user.id,
            associatedAt: new Date(),
          },
        });
      }
      await tx.auditLog.create({
        data: {
          ...auditRequestFields(),
          userId: user.id,
          action: 'FINANCE_INCOME_MEMBER_LINK',
          entity: 'Income',
          entityId: income.id,
          metadata: { memberId: data.memberId },
        },
      });
      return id
        ? tx.contribution.update({ where: { id }, data: dto })
        : tx.contribution.create({ data });
    });
  }
  async upload(expenseId: string, file: PrivateUpload, user: CurrentUser) {
    if (!(await this.db.expense.findUnique({ where: { id: expenseId } })))
      throw new NotFoundException();
    const storageKey = await this.storage.put(file);
    try {
      const a = await this.mutation(
        user,
        'FinancialAttachment',
        undefined,
        (tx) =>
          tx.financialAttachment.create({
            data: {
              expenseId,
              storageKey,
              filename: file.originalname.replace(/^.*[\\/]/, ''),
              mime: file.mimetype,
              size: file.size,
              uploadedBy: user.id,
            },
          }),
      );
      const { storageKey: _, ...publicAttachment } = a;
      void _;
      return publicAttachment;
    } catch (e) {
      await this.storage.remove(storageKey);
      throw e;
    }
  }
  async attachments(expenseId: string) {
    return this.db.financialAttachment.findMany({
      where: { expenseId },
      select: {
        id: true,
        expenseId: true,
        filename: true,
        mime: true,
        size: true,
        createdAt: true,
      },
    });
  }
  async download(id: string, user: CurrentUser) {
    const a = await this.db.financialAttachment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException();
    const buffer = await this.storage.get(a.storageKey);
    await this.db.auditLog.create({
      data: {
        ...auditRequestFields(),
        userId: user.id,
        action: 'FINANCE_ATTACHMENT_DOWNLOAD',
        entity: 'FinancialAttachment',
        entityId: id,
      },
    });
    return { buffer, filename: a.filename, mime: a.mime };
  }
  async dashboard(user: CurrentUser, q: DashboardQuery = {}) {
    const now = new Date();
    const month = q.month ?? now.toISOString().slice(0, 7);
    if (month > now.toISOString().slice(0, 7) || month < '2000-01')
      throw new BadRequestException(
        'Período deve estar entre 2000 e o mês atual',
      );
    const start = new Date(month + '-01T00:00:00Z');
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
    );
    const cutoff = new Date(Math.min(now.getTime(), end.getTime() - 1));
    const trendStart = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 5, 1),
    );
    const account = q.accountId ?? null;
    return this.db.$transaction(
      async (tx) => {
        const raw = await tx.$queryRaw<
          Array<{
            currency: string;
            income: Prisma.Decimal;
            expenses: Prisma.Decimal;
            balance: Prisma.Decimal;
            pendingIncome: Prisma.Decimal;
            pendingExpenses: Prisma.Decimal;
            tithes: Prisma.Decimal;
            offerings: Prisma.Decimal;
          }>
        >`
        WITH i AS (SELECT i."accountId",
          SUM(CASE WHEN i.status='COMPLETED' AND i.date>=${start} AND i.date<${end} THEN i.amount ELSE 0 END) AS monthly,
          SUM(CASE WHEN i.status='COMPLETED' AND i.date<=${cutoff} THEN i.amount ELSE 0 END) AS settled,
          SUM(CASE WHEN i.status='PENDING' THEN i.amount ELSE 0 END) AS pending,
          SUM(CASE WHEN i.status='COMPLETED' AND i.date>=${start} AND i.date<${end} AND c.type='TITHE' THEN i.amount ELSE 0 END) AS tithes,
          SUM(CASE WHEN i.status='COMPLETED' AND i.date>=${start} AND i.date<${end} AND c.type='OFFERING' THEN i.amount ELSE 0 END) AS offerings
          FROM incomes i LEFT JOIN contributions c ON c."incomeId"=i.id WHERE (${account}::uuid IS NULL OR i."accountId"=${account}::uuid) GROUP BY i."accountId"),
        e AS (SELECT "accountId",
          SUM(CASE WHEN status='COMPLETED' AND date>=${start} AND date<${end} THEN amount ELSE 0 END) AS monthly,
          SUM(CASE WHEN status='COMPLETED' AND "paidAt"<=${cutoff} THEN amount ELSE 0 END) AS settled,
          SUM(CASE WHEN status='PENDING' THEN amount ELSE 0 END) AS pending
          FROM expenses WHERE (${account}::uuid IS NULL OR "accountId"=${account}::uuid) GROUP BY "accountId")
        SELECT a.currency, SUM(COALESCE(i.monthly,0)) AS income,SUM(COALESCE(e.monthly,0)) AS expenses,
          SUM(a."openingBalance"+COALESCE(i.settled,0)-COALESCE(e.settled,0)) AS balance,
          SUM(COALESCE(i.pending,0)) AS "pendingIncome",SUM(COALESCE(e.pending,0)) AS "pendingExpenses",
          SUM(COALESCE(i.tithes,0)) AS tithes,SUM(COALESCE(i.offerings,0)) AS offerings
        FROM bank_accounts a LEFT JOIN i ON i."accountId"=a.id LEFT JOIN e ON e."accountId"=a.id
        WHERE (${account}::uuid IS NULL OR a.id=${account}::uuid) GROUP BY a.currency ORDER BY a.currency`;
        const balances = raw.map((b) => ({
          currency: b.currency,
          income: b.income,
          expenses: b.expenses,
          balance: b.balance,
          pendingIncome: b.pendingIncome,
          pendingExpenses: b.pendingExpenses,
          ...(user.permissions.includes('FINANCE_CONTRIBUTION_READ')
            ? { tithes: b.tithes, offerings: b.offerings }
            : {}),
        }));
        const trend = await tx.$queryRaw<
          Array<{
            month: string;
            currency: string;
            income: Prisma.Decimal;
            expenses: Prisma.Decimal;
          }>
        >`
        SELECT to_char(date,'YYYY-MM') AS month,currency,SUM(income) AS income,SUM(expenses) AS expenses FROM (
          SELECT i.date,a.currency,i.amount AS income,0::numeric AS expenses FROM incomes i JOIN bank_accounts a ON a.id=i."accountId" WHERE i.status='COMPLETED' AND i.date>=${trendStart} AND i.date<${end} AND (${account}::uuid IS NULL OR a.id=${account}::uuid)
          UNION ALL SELECT e.date,a.currency,0::numeric,e.amount FROM expenses e JOIN bank_accounts a ON a.id=e."accountId" WHERE e.status='COMPLETED' AND e.date>=${trendStart} AND e.date<${end} AND (${account}::uuid IS NULL OR a.id=${account}::uuid)
        ) movements GROUP BY to_char(date,'YYYY-MM'),currency ORDER BY month,currency`;
        const latestIncome = await tx.income.findMany({
          where: { accountId: q.accountId, date: { gte: start, lt: end } },
          include: { account: { select: { currency: true } } },
          take: 10,
          orderBy: [{ date: 'desc' }, { id: 'asc' }],
        });
        const latestExpense = await tx.expense.findMany({
          where: { accountId: q.accountId, date: { gte: start, lt: end } },
          include: { account: { select: { currency: true } } },
          take: 10,
          orderBy: [{ date: 'desc' }, { id: 'asc' }],
        });
        const unreconciled = await tx.bankTransaction.count({
          where: {
            status: { notIn: ['RECONCILED', 'REJECTED'] },
            import: { accountId: q.accountId },
          },
        });
        const latestImport =
          user.permissions.includes('FINANCE_BANK_IMPORT') &&
          user.permissions.includes('FINANCE_CONTRIBUTION_READ')
            ? await tx.bankImport.findFirst({
                where: { accountId: q.accountId },
                select: {
                  id: true,
                  filename: true,
                  status: true,
                  createdAt: true,
                  _count: { select: { transactions: true } },
                },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              })
            : undefined;
        return {
          month,
          balances,
          trend,
          unreconciled,
          latestImport,
          latestTransactions: [
            ...latestIncome.map((i) => ({
              ...this.sanitizeIncome(i, user),
              currency: i.account.currency,
              kind: 'INCOME',
            })),
            ...latestExpense.map((e) => ({
              ...e,
              currency: e.account.currency,
              kind: 'EXPENSE',
            })),
          ]
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .slice(0, 10),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
