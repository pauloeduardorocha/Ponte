import { auditRequestFields } from '../audit/audit-context';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrentUser } from '@church/shared';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../database/prisma.service';
import {
  ReportQuery,
  ReportExportQuery,
  ReportLookupQuery,
} from './reports.dto';
export type ReportRow = {
  id: string;
  kind: 'INCOME' | 'EXPENSE' | 'BANK';
  date: string;
  amount: string;
  currency: string;
  direction: string;
  description: string;
  status: string;
  accountId: string;
  account: string;
  categoryId: string | null;
  category: string;
  memberId: string | null;
  member: string;
  supplierId: string | null;
  supplier: string;
  costCenter: string;
  contributionType: string;
  contributionId: string | null;
  origin: string;
  reference: string;
  bankTransactionId: string | null;
  bankImportId: string | null;
  filename: string;
};
const typeNames: Record<string, string> = {
  TITHE: 'Dízimos',
  OFFERING: 'Ofertas',
  DONATION: 'Doações',
  OTHER: 'Outras contribuições',
};
const contributionReports = new Set([
  'tithes',
  'offerings',
  'donations',
  'member-contributions',
  'contribution-statement',
]);
const money = (n: Prisma.Decimal) => n.toFixed(2);
export function summarize(
  rows: ReportRow[],
  groupBy: (r: ReportRow) => string,
  identity: (r: ReportRow) => string = groupBy,
) {
  const groups = new Map<
    string,
    {
      label: string;
      groupKey: string;
      currency: string;
      income: Prisma.Decimal;
      expenses: Prisma.Decimal;
      sourceIds: string[];
    }
  >();
  for (const r of rows) {
    const label = groupBy(r),
      key = JSON.stringify([identity(r), r.currency]);
    const g = groups.get(key) ?? {
      label,
      groupKey: key,
      currency: r.currency,
      income: new Prisma.Decimal(0),
      expenses: new Prisma.Decimal(0),
      sourceIds: [],
    };
    if (r.direction === 'CREDIT') g.income = g.income.plus(r.amount);
    else g.expenses = g.expenses.plus(r.amount);
    g.sourceIds.push(r.id);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    income: money(g.income),
    expenses: money(g.expenses),
    net: money(g.income.minus(g.expenses)),
  }));
}
@Injectable()
export class ReportsService {
  constructor(private readonly db: PrismaService) {}
  async lookups(q: ReportLookupQuery, user: CurrentUser) {
    if (
      q.kind === 'members' &&
      !user.permissions.includes('FINANCE_CONTRIBUTION_READ')
    )
      throw new ForbiddenException();
    const args = {
      where: {
        name: { contains: q.search ?? '', mode: 'insensitive' as const },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' as const },
      take: 100,
    };
    if (q.kind === 'members') return this.db.member.findMany(args);
    if (q.kind === 'suppliers') return this.db.supplier.findMany(args);
    if (q.kind === 'accounts') return this.db.bankAccount.findMany(args);
    return this.db.financialCategory.findMany(args);
  }
  private access(q: ReportQuery, user: CurrentUser, exporting = false) {
    if (!user.permissions.includes('FINANCE_TRANSACTION_READ'))
      throw new ForbiddenException();
    const sensitive =
      contributionReports.has(q.report) ||
      Boolean(q.memberId || q.contributionType);
    if (sensitive && !user.permissions.includes('FINANCE_CONTRIBUTION_READ'))
      throw new ForbiddenException(
        'Permissão para visualizar contribuições necessária',
      );
    if (
      exporting &&
      sensitive &&
      !user.permissions.includes('FINANCE_CONTRIBUTION_EXPORT')
    )
      throw new ForbiddenException(
        'Permissão para exportar contribuições necessária',
      );
    if (
      q.report === 'unreconciled' &&
      !user.permissions.includes('FINANCE_BANK_IMPORT')
    )
      throw new ForbiddenException();
    if (
      q.start > q.end ||
      new Date(q.start).toISOString().slice(0, 10) !== q.start ||
      new Date(q.end).toISOString().slice(0, 10) !== q.end
    )
      throw new BadRequestException('Período inválido');
    if (q.report === 'contribution-statement' && !q.memberId)
      throw new BadRequestException(
        'Selecione um membro para o relatório individual',
      );
    if (
      q.report === 'unreconciled' &&
      (q.costCenter || q.status || q.contributionType)
    )
      throw new BadRequestException(
        'Utilize status bancário; movimentos não conciliados ainda não possuem centro de custo ou contribuição',
      );
    if (q.report !== 'unreconciled' && q.bankStatus)
      throw new BadRequestException(
        'Status bancário só se aplica aos não conciliados',
      );
    if (
      ['cash-flow', 'account-balances'].includes(q.report) &&
      q.status &&
      q.status !== 'COMPLETED'
    )
      throw new BadRequestException(
        'Fluxo de caixa e saldo consideram apenas lançamentos concluídos',
      );
  }
  async generate(q: ReportQuery, user: CurrentUser, exporting = false) {
    this.access(q, user, exporting);
    return this.db.$transaction(
      async (tx) => {
        const sensitive =
          contributionReports.has(q.report) ||
          Boolean(q.memberId || q.contributionType);
        // General reports never expose member information, including through export.
        const showMemberDetails =
          sensitive ||
          (user.permissions.includes('FINANCE_CONTRIBUTION_READ') &&
            (!exporting ||
              user.permissions.includes('FINANCE_CONTRIBUTION_EXPORT')));
        const date = { gte: new Date(q.start), lte: new Date(q.end) };
        const status = q.status ?? 'COMPLETED';
        const common = {
          accountId: q.accountId,
          categoryId: q.categoryId,
          costCenter: q.costCenter,
          status,
        };
        const type =
          q.report === 'tithes'
            ? 'TITHE'
            : q.report === 'offerings'
              ? 'OFFERING'
              : q.report === 'donations'
                ? 'DONATION'
                : q.contributionType;
        if (type && q.contributionType && type !== q.contributionType)
          throw new BadRequestException('Tipo incompatível com o relatório');
        const contributionWhere = sensitive
          ? { memberId: q.memberId, type }
          : undefined;
        const incomeWhere: Prisma.IncomeWhereInput = {
          ...common,
          date,
          ...(contributionReports.has(q.report) || q.contributionType
            ? { contribution: { is: contributionWhere } }
            : {}),
          ...(q.memberId &&
          !contributionReports.has(q.report) &&
          !q.contributionType
            ? {
                OR: [
                  { memberId: q.memberId },
                  { contribution: { is: { memberId: q.memberId } } },
                ],
              }
            : {}),
          ...(q.supplierId ? { id: { in: [] } } : {}),
        };
        const cash = ['cash-flow', 'account-balances'].includes(q.report);
        const expenseWhere: Prisma.ExpenseWhereInput = {
          ...common,
          ...(cash ? { paidAt: date } : { date }),
          supplierId: q.supplierId,
          ...(q.memberId || sensitive ? { id: { in: [] } } : {}),
        };
        const rows: ReportRow[] = [];
        const bankInclude = { include: { import: true } } as const;

        if (q.report === 'unreconciled') {
          if (!user.permissions.includes('FINANCE_CONTRIBUTION_READ'))
            throw new ForbiddenException(
              'Extratos bancários exigem acesso a contribuições',
            );
          if (
            exporting &&
            !user.permissions.includes('FINANCE_CONTRIBUTION_EXPORT')
          )
            throw new ForbiddenException(
              'Exportação de extratos exige permissão de contribuições',
            );
          const banks = await tx.bankTransaction.findMany({
            where: {
              date,
              import: {
                accountId: q.accountId,
                status: { in: ['READY_FOR_REVIEW', 'CONFIRMED'] },
              },
              status: q.bankStatus ?? { not: 'RECONCILED' },
              reconciliations: { none: { active: true } },
              categoryId: q.categoryId,
              memberId: q.memberId,
              supplierId: q.supplierId,
            },
            include: { import: { include: { account: true } } },
            orderBy: [{ date: 'asc' }, { id: 'asc' }],
            take: 10001,
          });
          const ids = banks.flatMap((b) =>
            b.categoryId ? [b.categoryId] : [],
          );
          const cats = await tx.financialCategory.findMany({
            where: { id: { in: ids } },
          });
          const members = await tx.member.findMany({
            where: {
              id: {
                in: banks.flatMap((b) => (b.memberId ? [b.memberId] : [])),
              },
            },
          });
          const suppliers = await tx.supplier.findMany({
            where: {
              id: {
                in: banks.flatMap((b) => (b.supplierId ? [b.supplierId] : [])),
              },
            },
          });
          for (const b of banks)
            rows.push({
              id: b.id,
              kind: 'BANK',
              date: b.date.toISOString().slice(0, 10),
              amount: money(b.amount),
              currency: b.import.account.currency,
              direction: b.direction,
              description: b.description,
              status: b.status,
              accountId: b.import.accountId,
              account: b.import.account.name,
              categoryId: b.categoryId,
              supplierId: b.supplierId,
              category: cats.find((c) => c.id === b.categoryId)?.name ?? '',
              memberId: b.memberId,
              member: members.find((m) => m.id === b.memberId)?.name ?? '',
              supplier:
                suppliers.find((s) => s.id === b.supplierId)?.name ?? '',
              costCenter: '',
              contributionType: '',
              contributionId: null,
              origin: 'Importação bancária',
              reference: b.reference,
              bankTransactionId: b.id,
              bankImportId: b.importId,
              filename: b.import.filename,
            });
        } else {
          if (
            !['expenses', 'expense-categories', 'supplier-expenses'].includes(
              q.report,
            )
          ) {
            const incomes = await tx.income.findMany({
              where: incomeWhere,
              include: {
                account: true,
                category: true,
                contribution: { include: { member: true } },
                member: true,
                bankTransaction: bankInclude,
              },
              orderBy: [{ date: 'asc' }, { id: 'asc' }],
              take: 10001,
            });
            for (const i of incomes)
              rows.push({
                id: i.id,
                kind: 'INCOME',
                date: i.date.toISOString().slice(0, 10),
                amount: money(i.amount),
                currency: i.account.currency,
                direction: 'CREDIT',
                description: showMemberDetails ? i.description : 'Receita',
                status: i.status,
                accountId: i.accountId,
                account: i.account.name,
                categoryId: i.categoryId,
                supplierId: null,
                category: i.category.name,
                memberId: showMemberDetails
                  ? (i.contribution?.memberId ?? i.memberId)
                  : null,
                member: showMemberDetails
                  ? (i.contribution?.member.name ?? i.member?.name ?? '')
                  : '',
                supplier: '',
                costCenter: i.costCenter ?? '',
                contributionType: showMemberDetails
                  ? (i.contribution?.type ?? '')
                  : '',
                contributionId: showMemberDetails
                  ? (i.contribution?.id ?? null)
                  : null,
                origin: showMemberDetails ? i.origin : 'Lançamento financeiro',
                reference: showMemberDetails ? (i.reference ?? '') : '',
                bankTransactionId: i.bankTransactionId,
                bankImportId: i.bankTransaction?.importId ?? null,
                filename: showMemberDetails
                  ? (i.bankTransaction?.import.filename ?? '')
                  : '',
              });
          }
          if (
            !['incomes', 'income-categories'].includes(q.report) &&
            !contributionReports.has(q.report)
          ) {
            const expenses = await tx.expense.findMany({
              where: expenseWhere,
              include: {
                account: true,
                category: true,
                supplier: true,
                bankTransaction: bankInclude,
              },
              orderBy: [{ date: 'asc' }, { id: 'asc' }],
              take: 10001,
            });
            for (const e of expenses)
              rows.push({
                id: e.id,
                kind: 'EXPENSE',
                date: (cash ? e.paidAt! : e.date).toISOString().slice(0, 10),
                amount: money(e.amount),
                currency: e.account.currency,
                direction: 'DEBIT',
                description: e.description,
                status: e.status,
                accountId: e.accountId,
                account: e.account.name,
                categoryId: e.categoryId,
                supplierId: e.supplierId,
                category: e.category.name,
                memberId: null,
                member: '',
                supplier: e.supplier?.name ?? '',
                costCenter: e.costCenter ?? '',
                contributionType: '',
                contributionId: null,
                origin: e.bankTransactionId
                  ? 'Importação bancária'
                  : 'Lançamento financeiro',
                reference: e.document ?? '',
                bankTransactionId: e.bankTransactionId,
                bankImportId: e.bankTransaction?.importId ?? null,
                filename: '',
              });
          }
        }
        if (rows.length > 10000)
          throw new BadRequestException(
            'Mais de 10000 registros. Reduza o período ou refine os filtros.',
          );
        rows.sort(
          (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
        );
        const totals = summarize(rows, () => 'Total');
        const groupName = (r: ReportRow) =>
          q.report.includes('categories')
            ? r.category
            : q.report === 'supplier-expenses'
              ? r.supplierId
                ? r.supplier
                : 'Sem fornecedor'
              : q.report === 'member-contributions'
                ? r.member
                : q.report === 'monthly-evolution' || q.report === 'cash-flow'
                  ? r.date.slice(0, 7)
                  : sensitive
                    ? r.contributionType
                    : r.account;
        const groups = summarize(rows, groupName, (r) =>
          q.report.includes('categories')
            ? (r.categoryId ?? '')
            : q.report === 'supplier-expenses'
              ? (r.supplierId ?? '')
              : q.report === 'member-contributions'
                ? (r.memberId ?? '')
                : q.report === 'monthly-evolution' ||
                    q.report === 'cash-flow' ||
                    sensitive
                  ? groupName(r)
                  : r.accountId,
        );
        let openingSourceCount = 0;
        const balances: {
          accountId: string;
          account: string;
          currency: string;
          opening: string;
          income: string;
          expenses: string;
          closing: string;
          initialBalance: string;
          openingSources: {
            id: string;
            kind: string;
            date: string;
            amount: string;
          }[];
        }[] = [];
        if (q.report === 'account-balances') {
          if (
            q.categoryId ||
            q.memberId ||
            q.supplierId ||
            q.costCenter ||
            q.contributionType
          )
            throw new BadRequestException(
              'Saldo por conta aceita período e conta; use os demais relatórios para filtrar lançamentos',
            );
          const accounts = await tx.bankAccount.findMany({
            where: { id: q.accountId },
            orderBy: { name: 'asc' },
          });
          for (const a of accounts) {
            const [i, e] = await Promise.all([
              tx.income.findMany({
                where: {
                  accountId: a.id,
                  status: 'COMPLETED',
                  date: { lt: new Date(q.start) },
                },
                select: { id: true, amount: true, date: true },
                take: 10001,
              }),
              tx.expense.findMany({
                where: {
                  accountId: a.id,
                  status: 'COMPLETED',
                  paidAt: { lt: new Date(q.start) },
                },
                select: { id: true, amount: true, paidAt: true },
                take: 10001,
              }),
            ]);
            if (
              (openingSourceCount += i.length + e.length) + rows.length >
              10000
            )
              throw new BadRequestException(
                'Saldo com mais de 10000 fontes. Reduza as contas selecionadas.',
              );
            const opening = a.openingBalance
              .plus(
                i.reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0)),
              )
              .minus(
                e.reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0)),
              );
            const movement = summarize(
              rows.filter((r) => r.accountId === a.id),
              () => a.name,
            )[0];
            const income = movement?.income ?? '0.00',
              expenses = movement?.expenses ?? '0.00';
            balances.push({
              accountId: a.id,
              account: a.name,
              currency: a.currency,
              opening: money(opening),
              income,
              expenses,
              closing: money(opening.plus(income).minus(expenses)),
              initialBalance: money(a.openingBalance),
              openingSources: [
                ...i.map((r) => ({
                  id: r.id,
                  kind: 'INCOME',
                  date: r.date.toISOString().slice(0, 10),
                  amount: money(r.amount),
                })),
                ...e.map((r) => ({
                  id: r.id,
                  kind: 'EXPENSE',
                  date: r.paidAt!.toISOString().slice(0, 10),
                  amount: money(r.amount),
                })),
              ],
            });
          }
        }
        const member = q.memberId
          ? await tx.member.findUnique({
              where: { id: q.memberId },
              select: { id: true, name: true },
            })
          : null;
        return {
          report: q.report,
          filters: q,
          generatedAt: new Date().toISOString(),
          church: {
            name:
              q.churchName?.trim() ||
              process.env.CHURCH_NAME ||
              'Identificação da igreja não configurada',
            taxId: q.churchTaxId || process.env.CHURCH_TAX_ID || '',
            address: q.churchAddress || process.env.CHURCH_ADDRESS || '',
          },
          member,
          observations: q.observations ?? '',
          purpose:
            'Apoio à preparação de informações fiscais. Este relatório não constitui declaração fiscal oficial e não substitui contabilista.',
          basis: cash
            ? 'Receitas concluídas pela data do lançamento; despesas concluídas pela data do pagamento. Saldo inicial conforme cadastro da conta.'
            : 'Data do lançamento; status padrão: concluído. Totais separados por moeda.',
          rows,
          totals,
          groups,
          balances,
          count: rows.length,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30000,
      },
    );
  }
  async export(q: ReportExportQuery, user: CurrentUser) {
    const report = await this.generate(q, user, true);
    if (q.format === 'pdf' && q.report !== 'contribution-statement')
      throw new BadRequestException(
        'PDF disponível para o relatório individual de contribuições',
      );
    if (
      q.report === 'contribution-statement' &&
      !q.churchName?.trim() &&
      !process.env.CHURCH_NAME
    )
      throw new BadRequestException('Informe a identificação da igreja');
    const columns = [
      'Data',
      'Tipo',
      'Valor',
      'Moeda',
      'Conta',
      'Categoria',
      'Membro',
      'Fornecedor',
      'Centro de custo',
      'Status',
      'Origem',
      'Referência',
      'ID lançamento',
      'ID contribuição',
      'ID transação bancária',
      'ID importação',
      'Arquivo',
    ];
    const records = report.rows.map((r) => [
      r.date,
      r.contributionType || r.kind,
      r.amount,
      r.currency,
      r.account,
      r.category,
      r.member,
      r.supplier,
      r.costCenter,
      r.status,
      r.origin,
      r.reference,
      r.id,
      r.contributionId ?? '',
      r.bankTransactionId ?? '',
      r.bankImportId ?? '',
      r.filename,
    ]);
    const metadata = [
      ['Relatório', q.report],
      ['Período', `${q.start} a ${q.end}`],
      ['Igreja', report.church.name],
      ['Identificação fiscal', report.church.taxId],
      ['Endereço', report.church.address],
      ['Membro', report.member?.name ?? ''],
      ['Filtros', JSON.stringify(q)],
      ['Observações', report.observations],
      ['Finalidade', report.purpose],
      ['Critério', report.basis],
    ];
    const summaries = report.groups.map((g) => [
      'Grupo',
      g.label,
      g.currency,
      'Receitas',
      g.income,
      'Despesas',
      g.expenses,
      'Líquido',
      g.net,
      'Fontes',
      g.sourceIds.join(','),
    ]);
    const balanceRecords = report.balances.map((b) => [
      'Saldo',
      b.account,
      b.accountId,
      b.currency,
      'Inicial',
      b.opening,
      'Receitas',
      b.income,
      'Despesas',
      b.expenses,
      'Final',
      b.closing,
      'Saldo cadastrado',
      b.initialBalance,
      'Fontes anteriores',
      JSON.stringify(b.openingSources),
    ]);
    const totals = report.totals.map((t) => [
      'Total',
      t.currency,
      'Receitas',
      t.income,
      'Despesas',
      t.expenses,
      'Líquido',
      t.net,
    ]);
    let buffer: Buffer;
    let mime: string;
    if (q.format === 'csv') {
      const escape = (v: string) =>
        '"' +
        (/^[\s]*[=+@-]/.test(v) ? "'" + v : v).replaceAll('"', '""') +
        '"';
      buffer = Buffer.from(
        '\uFEFF' +
          [
            ...metadata,
            [],
            columns,
            ...records,
            [],
            ...summaries,
            ...balanceRecords,
            ...totals,
          ]
            .map((r) => r.map(escape).join(';'))
            .join('\r\n'),
      );
      mime = 'text/csv; charset=utf-8';
    } else if (q.format === 'xlsx') {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Relatório');
      for (const r of [
        ...metadata,
        [],
        columns,
        ...records,
        [],
        ...summaries,
        ...balanceRecords,
        ...totals,
      ])
        sheet.addRow(r);
      sheet.columns.forEach((c) => {
        c.width = 24;
      });
      sheet.getRow(metadata.length + 2).font = { bold: true };
      buffer = Buffer.from(await book.xlsx.writeBuffer());
      mime =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      buffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 45 });
        const chunks: Buffer[] = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('error', reject);
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.fontSize(18).text('Relatório de contribuições');
        doc.moveDown();
        doc.fontSize(10);
        for (const r of metadata.filter((r) => r[0] !== 'Filtros')) {
          doc.text(`${r[0]}: ${r[1]}`);
          doc.moveDown(0.3);
        }
        for (const g of report.groups)
          doc.text(
            `${typeNames[g.label] ?? g.label}: ${g.income} ${g.currency}`,
          );
        for (const t of report.totals)
          doc.fontSize(12).text(`Total: ${t.income} ${t.currency}`);
        doc.moveDown();
        doc.fontSize(10);
        for (const r of report.rows) {
          const heading = `${r.date} | ${typeNames[r.contributionType] ?? r.contributionType} | ${r.amount} ${r.currency}`;
          const details = [
            `Origem: ${r.origin} | Referência: ${r.reference || 'Não informada'}`,
            `Lançamento: ${r.id} | Contribuição: ${r.contributionId}`,
            `Transação bancária: ${r.bankTransactionId ?? 'Não aplicável'} | Importação: ${r.bankImportId ?? 'Não aplicável'}`,
          ];
          const height =
            doc.fontSize(10).heightOfString(heading) +
            details.reduce(
              (sum, line) => sum + doc.fontSize(9).heightOfString(line),
              0,
            ) +
            16;
          if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            doc.fontSize(12).text('Relatório de contribuições — continuação');
            doc
              .fontSize(9)
              .text(`${report.member?.name ?? ''} | ${q.start} a ${q.end}`);
            doc.moveDown();
          }
          doc.fontSize(10);
          doc
            .moveDown(0.5)
            .text(
              `${r.date} | ${typeNames[r.contributionType] ?? r.contributionType} | ${r.amount} ${r.currency}`,
            );
          doc
            .fontSize(9)
            .text(
              `Origem: ${r.origin} | Referência: ${r.reference || 'Não informada'}`,
            )
            .text(`Lançamento: ${r.id} | Contribuição: ${r.contributionId}`)
            .text(
              `Transação bancária: ${r.bankTransactionId ?? 'Não aplicável'} | Importação: ${r.bankImportId ?? 'Não aplicável'}`,
            );
          doc.fontSize(10);
        }
        doc.end();
      });
      mime = 'application/pdf';
    }
    await this.db.auditLog.create({
      data: {
        ...auditRequestFields(),
        userId: user.id,
        action: 'FINANCE_REPORT_EXPORT',
        entity: 'FinancialReport',
        entityId: q.report,
        metadata: {
          report: q.report,
          filters: JSON.parse(JSON.stringify(q)),
          format: q.format,
          count: report.count,
          generatedAt: report.generatedAt,
        },
      },
    });
    return {
      buffer,
      mime,
      filename: `${q.report}-${q.start}-${q.end}.${q.format}`,
    };
  }
}
