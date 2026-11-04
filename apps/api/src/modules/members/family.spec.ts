import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ForbiddenException } from '@nestjs/common';
import type { CurrentUser } from '@church/shared';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { FamilyDto } from './family.dto';
import { FamilyService } from './family.service';

const ownerId = '00000000-0000-4000-8000-000000000001';
const relativeId = '00000000-0000-4000-8000-000000000002';
const actor = {
  id: 'user',
  permissions: [],
  status: 'ACTIVE',
} as unknown as CurrentUser;

describe('Family validation', () => {
  const basic = {
    relation: 'SPOUSE',
    name: 'Familiar',
    birthDate: '1990-01-02',
  };
  it('allows a relative without contacts or account', async () => {
    expect(await validate(plainToInstance(FamilyDto, basic))).toEqual([]);
  });
  it('requires email, phone and a strong password when creating access', async () => {
    const errors = await validate(
      plainToInstance(FamilyDto, { ...basic, createAccount: true }),
    );
    expect(errors.map((e) => e.property).sort()).toEqual([
      'email',
      'password',
      'phone',
    ]);
    expect(
      await validate(
        plainToInstance(FamilyDto, {
          ...basic,
          createAccount: true,
          email: 'test@example.org',
          phone: '+351 912345678',
          password: 'a-long-password',
        }),
      ),
    ).toEqual([]);
  });
  it('requires a parent role for the reciprocal child link', async () => {
    const errors = await validate(
      plainToInstance(FamilyDto, { relation: 'CHILD', memberId: relativeId }),
    );
    expect(errors.map((e) => e.property)).toEqual(['parentRole']);
    expect(
      await validate(
        plainToInstance(FamilyDto, {
          relation: 'CHILD',
          parentRole: 'MOTHER',
          memberId: relativeId,
        }),
      ),
    ).toEqual([]);
  });
  it('rejects invalid birth dates and short passwords', async () => {
    const errors = await validate(
      plainToInstance(FamilyDto, {
        ...basic,
        birthDate: '2026-02-30',
        createAccount: true,
        email: 'invalid',
        phone: 'abc',
        password: 'short',
      }),
    );
    expect(errors.map((e) => e.property).sort()).toEqual([
      'birthDate',
      'email',
      'password',
      'phone',
    ]);
  });
});

describe('Family service', () => {
  function setup() {
    const member = {
      id: ownerId,
      name: 'Membro',
      status: 'ACTIVE',
      anonymizedAt: null,
    };
    const db = {
      user: { findUnique: jest.fn().mockResolvedValue({ memberId: ownerId }) },
      member: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: { where: { id: string } }) =>
            Promise.resolve({ ...member, id: where.id }),
          ),
        create: jest.fn().mockResolvedValue({ id: relativeId }),
      },
      memberRelationship: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    db.$transaction.mockImplementation((run: (tx: typeof db) => unknown) =>
      run(db),
    );
    return { db, service: new FamilyService(db as unknown as PrismaService) };
  }
  it('rejects changes and reads to another member without administrative permissions', async () => {
    const { service, db } = setup();
    await expect(service.list(relativeId, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.save(
        relativeId,
        { relation: 'SPOUSE', memberId: ownerId },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.remove(relativeId, 'link', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('creates a real member without a user when access is unchecked', async () => {
    const { service, db } = setup();
    await service.save(
      'me',
      { relation: 'SPOUSE', name: 'Familiar', birthDate: '1990-01-01' },
      actor,
    );
    const data = db.member.create.mock.calls[0][0].data;
    expect(data.withoutAccount).toBe(true);
    expect(data.email).toBeNull();
    expect(data.user).toBeUndefined();
    expect(db.memberRelationship.upsert.mock.calls[0][0].create).toMatchObject({
      firstRole: 'SPOUSE',
      secondRole: 'SPOUSE',
    });
  });
  it('creates a hashed pending account without roles in the same transaction', async () => {
    const { service, db } = setup();
    await service.save(
      'me',
      {
        relation: 'CHILD',
        parentRole: 'MOTHER',
        name: 'Familiar',
        birthDate: '2000-01-01',
        createAccount: true,
        email: 'family@example.org',
        phone: '+351912345678',
        password: 'long-test-password',
      },
      actor,
    );
    const data = db.member.create.mock.calls[0][0].data;
    expect(data.withoutAccount).toBe(false);
    expect(data.user.create.status).toBe('PENDING_APPROVAL');
    expect(data.user.create.userRoles).toBeUndefined();
    expect(
      await argon2.verify(data.user.create.passwordHash, 'long-test-password'),
    ).toBe(true);
    expect(db.memberRelationship.upsert.mock.calls[0][0].create).toMatchObject({
      firstRole: 'MOTHER',
      secondRole: 'CHILD',
    });
  });
  it('reuses the existing member and updates the reciprocal relationship', async () => {
    const { service, db } = setup();
    await service.save(
      'me',
      { relation: 'FATHER', memberId: relativeId },
      actor,
    );
    expect(db.member.create).not.toHaveBeenCalled();
    expect(db.memberRelationship.upsert.mock.calls[0][0].create).toMatchObject({
      firstId: ownerId,
      secondId: relativeId,
      firstRole: 'CHILD',
      secondRole: 'FATHER',
    });
    db.user.findUnique.mockResolvedValue({ memberId: relativeId });
    await service.save(
      'me',
      { relation: 'CHILD', parentRole: 'FATHER', memberId: ownerId },
      actor,
    );
    expect(db.memberRelationship.upsert.mock.calls[1][0].update).toEqual({
      firstRole: 'CHILD',
      secondRole: 'FATHER',
    });
  });
  it('projects reciprocal roles according to the viewer', async () => {
    const { service, db } = setup();
    db.memberRelationship.findMany.mockResolvedValue([
      {
        id: 'link',
        firstId: ownerId,
        secondId: relativeId,
        firstRole: 'MOTHER',
        secondRole: 'CHILD',
        first: { id: ownerId },
        second: { id: relativeId },
      },
    ]);
    expect((await service.list('me', actor))[0]).toMatchObject({
      relation: 'CHILD',
      parentRole: 'MOTHER',
      member: { id: relativeId },
    });
    db.user.findUnique.mockResolvedValue({ memberId: relativeId });
    expect((await service.list('me', actor))[0]).toMatchObject({
      relation: 'MOTHER',
      member: { id: ownerId },
    });
  });
  it('limits unlinking to a relationship involving the authorized member', async () => {
    const { service, db } = setup();
    await service.remove('me', 'link', actor);
    expect(db.memberRelationship.deleteMany).toHaveBeenCalledWith({
      where: { id: 'link', OR: [{ firstId: ownerId }, { secondId: ownerId }] },
    });
  });
  it('rejects self links and future births', async () => {
    const { service, db } = setup();
    await expect(
      service.save('me', { relation: 'SPOUSE', memberId: ownerId }, actor),
    ).rejects.toThrow('si mesmo');
    await expect(
      service.save(
        'me',
        { relation: 'SPOUSE', name: 'Familiar', birthDate: '2999-01-01' },
        actor,
      ),
    ).rejects.toThrow('futuro');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
