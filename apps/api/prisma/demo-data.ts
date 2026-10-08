import { seedOperations } from './operations-demo';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Fixed identifiers make the demo repeatable without changing existing records.
const id = (group: number, n: number) =>
  `d0${String(group).padStart(6, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

export async function seedDemoData(tx: Prisma.TransactionClient) {
  const actor = await tx.user.findUniqueOrThrow({
    where: { email: 'financeiro@ponte.example' },
  });
  const librarian = await tx.user.findUniqueOrThrow({
    where: { email: 'biblioteca@ponte.example' },
  });
  const members = [
    'a0b00000-0000-4000-8000-000000000001',
    'a0b00000-0000-4000-8000-000000000002',
  ];
  const today = new Date();
  const date = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      Math.min(today.getUTCDate(), 5),
    ),
  );
  const day = (offset: number) => new Date(date.getTime() + offset * 86400000);
  await tx.visitor.upsert({
    where: { id: id(1, 1) },
    create: {
      id: id(1, 1),
      name: 'Visitante demonstração',
      firstName: 'Visitante',
      lastName: 'demonstração',
      visitedAt: date,
      status: 'NEW',
    },
    update: {},
  });
  await tx.communityEvent.upsert({
    where: { id: id(2, 1) },
    create: {
      id: id(2, 1),
      name: 'Encontro da comunidade',
      startsAt: new Date(today.getTime() + 7 * 86400000),
      endsAt: new Date(today.getTime() + 7 * 86400000 + 3600000),
      location: 'Auditório',
      description: 'Evento fictício para demonstração',
    },
    update: {},
  });
  const book = await tx.book.findUniqueOrThrow({
    where: { isbn: 'DEMO-PONTE-001' },
  });
  for (let n = 2; n <= 3; n++) {
    const copy = await tx.bookCopy.upsert({
      where: { assetCode: `DEMO-00${n}` },
      create: {
        bookId: book.id,
        assetCode: `DEMO-00${n}`,
        location: 'Estante Demo',
        status: 'LOANED',
      },
      update: {},
    });
    const loan = await tx.loan.upsert({
      where: { id: id(3, n) },
      create: {
        id: id(3, n),
        memberId: members[n - 2]!,
        bookCopyId: copy.id,
        createdBy: librarian.id,
        borrowedAt: day(-20),
        dueAt: n === 3 ? day(-5) : day(20),
        status: n === 3 ? 'OVERDUE' : 'ACTIVE',
        graceDays: 0,
        dailyFine: '1.00',
      },
      update: {},
    });
    if (n === 3)
      await tx.fine.upsert({
        where: { loanId: loan.id },
        create: { loanId: loan.id, amount: '5.00' },
        update: {},
      });
  }
  const categoryIds = new Map<number, string>();
  // Existing demo ledgers retain their category identity even after a rename.
  for (const [group, count, offset, root] of [
    [7, 3, 1, 1],
    [8, 2, 5, 5],
  ]) {
    for (let n = 1; n <= count!; n++) {
      const entry =
        group === 7
          ? await tx.income.findUnique({
              where: { id: id(group, n) },
              include: { category: true },
            })
          : await tx.expense.findUnique({
              where: { id: id(group!, n) },
              include: { category: true },
            });
      if (entry) {
        categoryIds.set(n + offset!, entry.categoryId);
        if (entry.category.parentId && !categoryIds.has(root!))
          categoryIds.set(root!, entry.category.parentId);
      }
    }
  }
  for (const [n, name, kind, parent] of [
    [1, 'Receitas', 'INCOME', null],
    [2, 'Dízimos', 'INCOME', 1],
    [3, 'Ofertas', 'INCOME', 1],
    [4, 'Doações', 'INCOME', 1],
    [5, 'Despesas', 'EXPENSE', null],
    [6, 'Energia', 'EXPENSE', 5],
    [7, 'Aluguel', 'EXPENSE', 5],
  ] as const) {
    const existing =
      (await tx.financialCategory.findUnique({
        where: { id: categoryIds.get(n) ?? id(4, n) },
      })) ??
      (await tx.financialCategory.findFirst({
        where: {
          name,
          kind,
          parentId: parent ? categoryIds.get(parent)! : null,
        },
        orderBy: { id: 'asc' },
      }));
    const category =
      existing ??
      (await tx.financialCategory.create({
        data: {
          id: id(4, n),
          name,
          kind,
          parentId: parent ? categoryIds.get(parent)! : null,
        },
      }));
    categoryIds.set(n, category.id);
  }
  const account = await tx.bankAccount.upsert({
    where: { id: id(5, 1) },
    create: {
      id: id(5, 1),
      name: 'Conta demonstração EUR',
      bank: 'Banco fictício',
      currency: 'EUR',
      account: 'DEMO-001',
      openingBalance: '1000.00',
    },
    update: {},
  });
  await tx.supplier.upsert({
    where: { id: id(6, 1) },
    create: { id: id(6, 1), name: 'Fornecedor demonstração' },
    update: {},
  });
  for (let n = 1; n <= 3; n++) {
    const income = await tx.income.upsert({
      where: { id: id(7, n) },
      create: {
        id: id(7, n),
        amount: String(n * 100),
        date,
        categoryId: categoryIds.get(n + 1)!,
        accountId: account.id,
        description: ['Dízimo', 'Oferta', 'Doação'][n - 1] + ' demonstração',
        origin: 'Registro manual de demonstração',
        reference: `DEMO-RECEITA-${n}`,
        memberId: members[(n - 1) % 2],
        status: 'COMPLETED',
      },
      update: {},
    });
    await tx.contribution.upsert({
      where: { incomeId: income.id },
      create: {
        incomeId: income.id,
        memberId: income.memberId!,
        type: (['TITHE', 'OFFERING', 'DONATION'] as const)[n - 1]!,
      },
      update: {},
    });
  }
  for (let n = 1; n <= 2; n++)
    await tx.expense.upsert({
      where: { id: id(8, n) },
      create: {
        id: id(8, n),
        amount: String(n * 75),
        date,
        dueDate: day(10),
        paidAt: n === 1 ? date : null,
        categoryId: categoryIds.get(n + 5)!,
        accountId: account.id,
        supplierId: id(6, 1),
        description: 'Despesa demonstração',
        document: `DEMO-DESPESA-${n}`,
        status: n === 1 ? 'COMPLETED' : 'PENDING',
      },
      update: {},
    });
  await tx.income.upsert({
    where: { id: id(7, 4) },
    create: {
      id: id(7, 4),
      amount: '50',
      date,
      categoryId: categoryIds.get(3)!,
      accountId: account.id,
      description: 'Receita prevista demonstração',
      origin: 'Demonstração',
      status: 'PENDING',
    },
    update: {},
  });

  // The original file is private and downloadable through the guarded import endpoint.
  if (!(await tx.bankImport.findUnique({ where: { id: id(9, 1) } }))) {
    const rows = Array.from({ length: 150 }, (_, i) => ({
      date: date.toISOString().slice(0, 10),
      amount: (10 + i).toFixed(2),
      direction: i % 3 === 0 ? ('DEBIT' as const) : ('CREDIT' as const),
      description: `Movimento demonstração ${i + 1}`,
      reference: `DEMO-BANCO-${i + 1}`,
    }));
    const original = Buffer.from(
      'date,amount,type,description,reference,bankIdentifier\n' +
        rows
          .map(
            (r) =>
              `${r.date},${r.amount},${r.direction},${r.description},${r.reference},${r.reference}`,
          )
          .join('\n'),
    );
    const storageKey = randomUUID();
    const directory = resolve(
      process.env.PRIVATE_STORAGE_PATH ?? './private-storage',
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      await writeFile(resolve(directory, storageKey), original, {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    await tx.bankImport.create({
      data: {
        id: id(9, 1),
        accountId: account.id,
        storageKey,
        filename: 'demonstracao-150-movimentos.csv',
        format: 'CSV',
        mime: 'text/csv',
        size: original.length,
        fileHash: createHash('sha256').update(original).digest('hex'),
        uploadedBy: actor.id,
        status: 'READY_FOR_REVIEW',
      },
    });
    await tx.bankTransaction.createMany({
      data: rows.map((r, i) => ({
        id: id(11, i + 1),
        importId: id(9, 1),
        amount: r.amount,
        date,
        direction: r.direction,
        description: r.description,
        reference: r.reference,
        bankIdentifier: r.reference,
        rowNumber: i + 2,
        fingerprint: createHash('sha256')
          .update(
            JSON.stringify([
              account.id,
              r.date,
              r.amount,
              r.direction,
              r.reference.toLowerCase().replace(/[^a-z0-9]/g, ''),
              r.reference.toLowerCase().replace(/[^a-z0-9]/g, ''),
            ]),
          )
          .digest('hex'),
      })),
    });
  }
  await seedOperations(tx);
}
