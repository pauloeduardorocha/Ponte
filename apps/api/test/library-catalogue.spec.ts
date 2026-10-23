import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { LibraryService } from '../src/modules/library/library.service';

function fixture() {
  const categories = [
    { code: '54', name: 'Liderança' },
    { code: '55', name: 'Serviço cristão' },
  ];
  const book: Record<string, unknown> = {
    id: 'book1',
    title: 'Livro',
    author: null,
    categories: [],
    copies: [],
  };
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    librarySettings: { upsert: jest.fn().mockResolvedValue({ holdDays: 2 }) },
    loan: { findMany: jest.fn().mockResolvedValue([]) },
    reservation: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { create: jest.fn() },
    book: {
      create: jest.fn(async ({ data }) => {
        Object.assign(book, data);
        return book;
      }),
      update: jest.fn(async ({ data }) => Object.assign(book, data)),
      findUniqueOrThrow: jest.fn(async () => book),
    },
    libraryCategory: {
      findMany: jest.fn(async ({ where }) =>
        categories.filter((c) => where.code.in.includes(c.code)),
      ),
    },
    bookCategory: {
      deleteMany: jest.fn(async () => {
        book.categories = [];
      }),
      createMany: jest.fn(async ({ data }) => {
        book.categories = data.map((item: { categoryCode: string }) => ({
          ...item,
          category: categories.find((c) => c.code === item.categoryCode),
        }));
      }),
    },
  };
  const db = {
    $transaction: async (operation: (client: typeof tx) => unknown) =>
      operation(tx),
  };
  return {
    service: new LibraryService(db as unknown as PrismaService, {} as never),
    tx,
  };
}

describe('Structured library catalogue', () => {
  it('preserves source register and collection, accepts missing author and marks proposals', async () => {
    const { service } = fixture();
    const result = await service.createBook(
      {
        title: 'Livro',
        author: null,
        registrationNumber: '00001',
        collection: 'Coleção',
        primaryCategoryCode: '54',
        secondaryCategoryCodes: ['55'],
      },
      'actor',
    );
    expect(result).toMatchObject({
      registrationNumber: '00001',
      collection: 'Coleção',
      author: null,
      category: '54 — Liderança',
      primaryCategoryCode: '54',
      secondaryCategoryCodes: ['55'],
      classificationReviewed: false,
    });
    expect(result.categories).toHaveLength(2);
    expect(result.categories.every((item) => item.reviewedAt === null)).toBe(
      true,
    );
  });
  it('preserves the existing free category field when no structured theme is selected', async () => {
    const { service } = fixture();
    const result = await service.createBook(
      {
        title: 'Livro',
        category: 'Categoria livre',
        primaryCategoryCode: null,
        secondaryCategoryCodes: [],
      },
      'actor',
    );
    expect(result.category).toBe('Categoria livre');
  });
  it('rejects unknown themes and repeated primary/secondary themes before assigning them', async () => {
    for (const input of [
      { primaryCategoryCode: '99' },
      { primaryCategoryCode: '54', secondaryCategoryCodes: ['54'] },
      { secondaryCategoryCodes: ['55'] },
    ]) {
      const { service, tx } = fixture();
      await expect(
        service.createBook({ title: 'Livro', ...input }, 'actor'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.bookCategory.createMany).not.toHaveBeenCalled();
    }
  });
  it('records an explicit review when requested', async () => {
    const { service } = fixture();
    const result = await service.createBook(
      {
        title: 'Livro',
        primaryCategoryCode: '54',
        classificationReviewed: true,
      },
      'actor',
    );
    expect(result.classificationReviewed).toBe(true);
  });
  it('returns distinct, paginated related subjects for autocomplete', async () => {
    const { service, tx } = fixture();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'Discipulado', name: 'Discipulado' }])
      .mockResolvedValueOnce([{ total: 1 }]);
    await expect(
      service.bookOptions('keyword', {
        search: 'discip',
        page: 2,
        pageSize: 10,
      } as never),
    ).resolves.toEqual({
      items: [{ id: 'Discipulado', name: 'Discipulado' }],
      total: 1,
      page: 2,
      pageSize: 10,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
