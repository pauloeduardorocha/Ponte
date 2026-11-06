import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { AuthRequest } from '../auth/auth.guard';
import {
  ConversationsController,
  ConversationTopicDto,
  ConversationReplyDto,
  validateConversationImage,
} from './conversations.controller';

const topicId = '00000000-0000-4000-8000-000000000001';
const memberId = '00000000-0000-4000-8000-000000000002';
function actor(id = 'author', roles?: string[], status = 'ACTIVE') {
  return {
    user: { id, roles, status, permissions: [] },
  } as unknown as AuthRequest;
}
const post = (overrides = {}) => ({
  id: topicId,
  topicId: null,
  title: 'Tema',
  body: 'Conteúdo privado',
  hasImage: true,
  authorId: 'author',
  author: { id: 'author', name: 'Autor', deletedAt: null, member: null },
  mentions: [],
  createdAt: new Date(),
  deletedAt: null,
  ...overrides,
});

describe('Conversations', () => {
  let db: {
    conversationPost: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    member: { count: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let controller: ConversationsController;
  beforeEach(() => {
    db = {
      conversationPost: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: topicId }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(1),
      },
      member: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };
    db.$transaction.mockImplementation((fn) => fn(db));
    controller = new ConversationsController(db as unknown as PrismaService);
  });

  it.each(['PENDING_APPROVAL', 'DISABLED', 'INVITED'])(
    'blocks %s on every operation',
    async (status) => {
      const r = actor('author', [], status);
      for (const operation of [
        () => controller.list(r),
        () => controller.members(r, 'Ana'),
        () => controller.detail(r, topicId),
        () => controller.replies(r, topicId, memberId),
        () => controller.image(r, topicId),
        () => controller.create(r, { title: 'Tema', body: 'Texto' }),
        () => controller.reply(r, topicId, { body: 'Texto' }),
        () => controller.remove(r, topicId),
      ])
        await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.conversationPost.findMany).not.toHaveBeenCalled();
    },
  );

  it('allows approved accounts without administrative permissions to create independent topics', async () => {
    await controller.create(actor(), {
      title: ' Tema ',
      body: ' https://example.org ',
    });
    expect(db.conversationPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Tema',
          body: 'https://example.org',
          authorId: 'author',
          hasImage: false,
        }),
      }),
    );
    expect(
      db.conversationPost.create.mock.calls[0][0].data.topicId,
    ).toBeUndefined();
  });

  it.each([
    actor(),
    actor('admin', ['ADMIN']),
    actor('super', ['SUPER_ADMIN']),
  ])('allows the author or administrators to soft-delete', async (r) => {
    db.conversationPost.findUnique.mockResolvedValue({ authorId: 'author' });
    await controller.remove(r, topicId);
    expect(db.conversationPost.updateMany).toHaveBeenCalledWith({
      where: { id: topicId, deletedAt: null },
      data: { deletedAt: expect.any(Date), deletedBy: r.user.id },
    });
  });

  it.each([actor('other'), actor('pastor', ['PASTOR'])])(
    'rejects deletion by other members, including a pastor without admin role',
    async (r) => {
      db.conversationPost.findUnique.mockResolvedValue({ authorId: 'author' });
      await expect(controller.remove(r, topicId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(db.conversationPost.updateMany).not.toHaveBeenCalled();
    },
  );

  it('redacts deleted topics and replies without losing their place, author or date', async () => {
    const deleted = post({ deletedAt: new Date(), mentions: [memberId] });
    db.conversationPost.findFirst.mockResolvedValue(deleted);
    db.conversationPost.findMany.mockResolvedValue([
      post({ ...deleted, topicId }),
    ]);
    const result = await controller.detail(actor(), topicId);
    expect(result.topic).toMatchObject({
      title: null,
      body: '',
      hasImage: false,
      mentions: [],
      author: { name: 'Autor' },
    });
    expect(result.items[0]).toMatchObject({ body: '', hasImage: false });
    expect(JSON.stringify(result)).not.toContain('Conteúdo privado');
    expect(result.topic).not.toHaveProperty('image');
    expect(result.topic?.author).not.toHaveProperty('deletedAt');
  });

  it('does not expose deleted image bytes', async () => {
    db.conversationPost.findFirst.mockResolvedValue(null);
    await expect(controller.image(actor(), topicId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.conversationPost.findFirst).toHaveBeenCalledWith({
      where: { id: topicId, deletedAt: null },
      select: { image: true },
    });
  });

  it('rejects replies to deleted topics and to other replies inside the transaction', async () => {
    db.conversationPost.findFirst.mockResolvedValue(null);
    await expect(
      controller.reply(actor(), topicId, { body: 'Resposta' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.conversationPost.create).not.toHaveBeenCalled();
  });

  it('persists replies under the chosen topic and validates member references', async () => {
    db.member.count.mockResolvedValue(1);
    db.conversationPost.findFirst.mockResolvedValue({ id: topicId });
    await controller.reply(actor(), topicId, {
      body: `Olá @[Maria](${memberId})`,
    });
    expect(db.conversationPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topicId,
          mentions: [memberId],
          authorId: 'author',
        }),
      }),
    );
    db.member.count.mockResolvedValue(0);
    await expect(
      controller.reply(actor(), topicId, { body: `@[Inativo](${memberId})` }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves current names and hides stale or anonymized names in mention tokens', async () => {
    db.conversationPost.findMany.mockResolvedValue([
      post({
        body: `Olá @[Nome antigo](${memberId})`,
        mentions: [memberId],
        author: {
          id: 'author',
          name: 'Nome privado',
          deletedAt: null,
          member: { anonymizedAt: new Date() },
        },
      }),
    ]);
    const result = await controller.list(actor());
    expect(result.items[0]?.body).toContain('@[membro indisponível]');
    expect(result.items[0]?.author.name).toBe('Membro indisponível');
    expect(JSON.stringify(result)).not.toContain('Nome antigo');
  });

  it('paginates cards without selecting image bytes and rejects invalid pages', async () => {
    db.conversationPost.findMany.mockResolvedValue(
      Array.from({ length: 21 }, () => post()),
    );
    const result = await controller.list(actor(), '1');
    expect(result.items).toHaveLength(20);
    expect(result.hasMore).toBe(true);
    expect(db.conversationPost.findMany.mock.calls[0][0]).toMatchObject({
      skip: 20,
      take: 21,
    });
    expect(
      db.conversationPost.findMany.mock.calls[0][0].select.image,
    ).toBeUndefined();
    await expect(controller.list(actor(), '-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('searches only active, non-anonymized members and selects no contact data', async () => {
    expect(await controller.members(actor(), 'A')).toEqual([]);
    expect(db.member.findMany).not.toHaveBeenCalled();
    await controller.members(actor(), 'Maria');
    expect(db.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          anonymizedAt: null,
          name: { contains: 'Maria', mode: 'insensitive' },
        },
        select: { id: true, name: true },
        take: 10,
      }),
    );
  });

  it('returns the page containing a new reply after the first ten messages', async () => {
    db.conversationPost.findFirst.mockResolvedValue({ id: topicId });
    db.conversationPost.count.mockResolvedValue(11);
    expect(
      await controller.reply(actor(), topicId, {
        body: 'Décima primeira resposta',
      }),
    ).toEqual({ id: topicId, page: 1 });
  });

  it('links a reply only to an active comment in the same conversation', async () => {
    db.conversationPost.findFirst
      .mockResolvedValueOnce({ id: topicId })
      .mockResolvedValueOnce({ id: memberId });
    await controller.reply(actor(), topicId, {
      body: 'Resposta ao comentário',
      parentId: memberId,
    });
    expect(db.conversationPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ topicId, parentId: memberId }),
      }),
    );
    expect(db.conversationPost.count).toHaveBeenCalledWith({
      where: { topicId, parentId: memberId },
    });
    db.conversationPost.findFirst
      .mockResolvedValueOnce({ id: topicId })
      .mockResolvedValueOnce(null);
    await expect(
      controller.reply(actor(), topicId, {
        body: 'Resposta',
        parentId: memberId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.conversationPost.create).toHaveBeenCalledTimes(1);
  });

  it('loads ten child comments without mixing conversations or parent threads', async () => {
    db.conversationPost.findFirst.mockResolvedValue({ id: memberId });
    db.conversationPost.findMany.mockResolvedValue(
      Array.from({ length: 11 }, () => post({ parentId: memberId, topicId })),
    );
    const result = await controller.replies(
      actor(),
      topicId,
      memberId,
      '1',
      'desc',
    );
    expect(result.items).toHaveLength(10);
    expect(result.hasMore).toBe(true);
    expect(db.conversationPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { topicId, parentId: memberId },
        skip: 10,
        take: 11,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    db.conversationPost.findFirst.mockResolvedValue(null);
    await expect(
      controller.replies(actor(), topicId, memberId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists top-level comments separately and preserves the default order for old clients', async () => {
    db.conversationPost.findFirst.mockResolvedValue(post());
    await controller.detail(actor(), topicId);
    expect(db.conversationPost.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { topicId, parentId: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
    await controller.detail(actor(), topicId, '0', 'desc');
    expect(db.conversationPost.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    await expect(
      controller.detail(actor(), topicId, '0', 'invalid'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      (
        await validate(
          plainToInstance(ConversationReplyDto, {
            body: 'Resposta',
            parentId: 'invalid',
          }),
        )
      ).map((error) => error.property),
    ).toEqual(['parentId']);
  });

  it('validates DTO lengths and refuses whitespace-only content', async () => {
    expect(
      (
        await validate(
          plainToInstance(ConversationTopicDto, {
            title: 'a'.repeat(161),
            body: 'b'.repeat(10001),
          }),
        )
      )
        .map((e) => e.property)
        .sort(),
    ).toEqual(['body', 'title']);
    await expect(
      controller.create(actor(), { title: ' ', body: 'Texto' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.create(actor(), { title: 'Tema', body: ' ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Conversation images', () => {
  function png(size: number) {
    const bytes = Buffer.alloc(size);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
    return `data:image/png;base64,${bytes.toString('base64')}`;
  }
  it('accepts the exact byte limit and rejects one byte more', () => {
    expect(validateConversationImage(png(1024 * 1024))).toBeDefined();
    expect(() => validateConversationImage(png(1024 * 1024 + 1))).toThrow(
      BadRequestException,
    );
  });
  it.each([
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,YWJj',
    'https://example.org/image.jpg',
  ])('rejects unsupported or mismatched image content', (image) => {
    expect(() => validateConversationImage(image)).toThrow(BadRequestException);
  });
});
