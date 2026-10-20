import { ConflictException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UsersController } from './users.controller';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuthRequest } from '../auth/auth.guard';
import { CreateMemberDto } from '../members/member.dto';
describe('Unified account access administration', () => {
  const actor = {
    user: { id: 'admin', permissions: ['USER_UPDATE'] },
  } as AuthRequest;
  it('rejects resetting the own password through administration', async () => {
    const controller = new UsersController(
      {} as PrismaService,
      {} as AuthService,
    );
    await expect(
      controller.password('admin', { password: 'long-test-password' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('refuses resetting an account with permissions above the administrator', async () => {
    const update = jest.fn();
    const tx = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn(),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          deletedAt: null,
          userRoles: [
            {
              role: {
                permissions: [{ permission: { code: 'PERMISSION_MANAGE' } }],
              },
            },
          ],
        }),
        update,
      },
    };
    const db = { $transaction: jest.fn(async (fn) => fn(tx)) };
    const controller = new UsersController(
      db as unknown as PrismaService,
      {} as AuthService,
    );
    await expect(
      controller.password(
        'super-admin',
        { password: 'long-test-password' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });
  it.each(['ADMIN', 'SUPER_ADMIN'])(
    '%s can reset any account including itself',
    async (role) => {
      const update = jest.fn().mockResolvedValue({});
      const tx = {
        $executeRaw: jest.fn(),
        $queryRaw: jest.fn(),
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({
              deletedAt: null,
              userRoles: [
                {
                  role: {
                    permissions: [
                      { permission: { code: 'PERMISSION_MANAGE' } },
                    ],
                  },
                },
              ],
            }),
          update,
        },
        refreshToken: { updateMany: jest.fn() },
        passwordReset: { updateMany: jest.fn() },
      };
      const db = { $transaction: jest.fn(async (fn) => fn(tx)) };
      const controller = new UsersController(
        db as unknown as PrismaService,
        {} as AuthService,
      );
      const request = {
        user: { id: 'admin', roles: [role], permissions: ['USER_UPDATE'] },
      } as AuthRequest;
      await expect(
        controller.password(
          'super-admin',
          { password: 'long-test-password' },
          request,
        ),
      ).resolves.toEqual({ id: 'super-admin' });
      await expect(
        controller.password(
          'admin',
          { password: 'long-test-password' },
          request,
        ),
      ).resolves.toEqual({ id: 'admin' });
      expect(update).toHaveBeenCalledTimes(2);
    },
  );
  it.each([undefined, null, ''])(
    'requires a valid email for new members (%s)',
    async (email) => {
      const errors = await validate(
        plainToInstance(CreateMemberDto, { name: 'Member', email }),
      );
      expect(errors.some((error) => error.property === 'email')).toBe(true);
    },
  );
});
