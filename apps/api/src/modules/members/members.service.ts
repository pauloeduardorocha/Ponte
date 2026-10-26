import { initialPasswordHash, memberAccountSelect } from './member-identity';
import { bindAudit } from '../audit/audit-context';
import {
  ConflictException,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '@church/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateMemberDto, MemberQuery, UpdateMemberDto } from './member.dto';

@Injectable()
export class MembersService {
  constructor(private readonly db: PrismaService) {}

  async list(query: MemberQuery) {
    const { page, pageSize, status, search, sortBy, sortOrder } = query;
    const where: Prisma.MemberWhereInput = {
      status,
      ...(search
        ? {
            OR: ['name', 'email', 'phone'].map((field) => ({
              [field]: { contains: search, mode: 'insensitive' },
            })),
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.member.findMany({
          where,
          include: { user: { select: memberAccountSelect } },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        }),
        this.db.member.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const member = await this.db.member.findUnique({
      where: { id },
      include: { user: { select: memberAccountSelect } },
    });
    if (!member) throw new NotFoundException('Membro não encontrado');
    return member;
  }

  async create(dto: CreateMemberDto) {
    const passwordHash = await initialPasswordHash();
    try {
      return await this.db.$transaction(async (tx) => {
        await bindAudit(tx);
        return tx.member.create({
          data: {
            ...dto,
            birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
            user: {
              create: {
                name: dto.name,
                email: dto.email,
                passwordHash,
                status: dto.status === 'INACTIVE' ? 'DISABLED' : 'ACTIVE',
              },
            },
          },
        });
      });
    } catch (error) {
      this.rethrowMissing(error);
    }
  }

  async update(id: string, dto: UpdateMemberDto, actor?: CurrentUser) {
    try {
      return await this.db.$transaction(async (tx) => {
        await bindAudit(tx);
        await tx.$queryRaw`SELECT id FROM members WHERE id=${id}::uuid FOR UPDATE`;
        const existing = await tx.member.findUnique({ where: { id } });
        if (existing?.anonymizedAt)
          throw new ConflictException(
            'Perfil anonimizado; não pode receber novos dados pessoais',
          );
        if (
          existing &&
          ((dto.email !== undefined && dto.email !== existing.email) ||
            dto.status === 'INACTIVE')
        ) {
          const account = await tx.user.findUnique({
            where: { memberId: id },
            include: {
              userRoles: {
                include: {
                  role: {
                    include: { permissions: { include: { permission: true } } },
                  },
                },
              },
            },
          });
          if (
            account &&
            (!actor?.permissions.includes('USER_UPDATE') ||
              account.userRoles.some(({ role }) =>
                role.permissions.some(
                  ({ permission }) =>
                    !actor.permissions.some((p) => p === permission.code),
                ),
              ))
          )
            throw new ForbiddenException(
              'A alteração de acesso exige permissão para gerenciar esta conta.',
            );
          if (account && dto.status === 'INACTIVE' && account.id === actor?.id)
            throw new ConflictException(
              'Não é permitido desativar sua própria conta',
            );
          if (
            account &&
            dto.email !== undefined &&
            dto.email !== existing.email
          ) {
            await tx.refreshToken.updateMany({
              where: { userId: account.id, revokedAt: null },
              data: { revokedAt: new Date() },
            });
            await tx.passwordReset.updateMany({
              where: { userId: account.id, usedAt: null },
              data: { usedAt: new Date() },
            });
          }
        }
        if (existing && (dto.name !== undefined || dto.email !== undefined)) {
          await tx.user.updateMany({
            where: { memberId: id, deletedAt: null },
            data: { name: dto.name, email: dto.email },
          });
        }
        if (dto.status === 'INACTIVE') {
          const account = await tx.user.findUnique({ where: { memberId: id } });
          if (account?.status === 'PENDING_APPROVAL')
            throw new ConflictException(
              'A conta deve ser aprovada pela lista de espera antes de alterar o acesso.',
            );
          if (account) {
            const admin = await tx.userRole.findFirst({
              where: { userId: account.id, role: { name: 'SUPER_ADMIN' } },
            });
            if (admin)
              throw new ConflictException(
                'Desative administradores pela gestão de acesso.',
              );
            await tx.user.update({
              where: { id: account.id },
              data: { status: 'DISABLED' },
            });
            await tx.refreshToken.updateMany({
              where: { userId: account.id, revokedAt: null },
              data: { revokedAt: new Date() },
            });
          }
        }
        return tx.member.update({
          include: { user: { select: memberAccountSelect } },
          where: { id },
          data: {
            ...dto,
            birthDate:
              dto.birthDate === undefined
                ? undefined
                : dto.birthDate
                  ? new Date(dto.birthDate)
                  : null,
          },
        });
      });
    } catch (error) {
      this.rethrowMissing(error);
    }
  }

  async delete(id: string) {
    try {
      await this.db.$transaction(async (tx) => {
        await bindAudit(tx);
        await tx.member.delete({ where: { id } });
      });
    } catch (error) {
      this.rethrowMissing(error);
    }
  }

  private rethrowMissing(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException('E-mail já cadastrado');
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    )
      throw new NotFoundException('Membro não encontrado');
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    )
      throw new ConflictException(
        'Membro possui registros vinculados; use o fluxo de privacidade ou inative o cadastro',
      );
    throw error;
  }
}
