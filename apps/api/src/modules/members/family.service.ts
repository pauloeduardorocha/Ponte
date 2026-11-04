import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '@church/shared';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { bindAudit } from '../audit/audit-context';
import { FamilyDto } from './family.dto';

const relativeSelect = {
  id: true,
  name: true,
  birthDate: true,
  user: { select: { status: true } },
} as const;

@Injectable()
export class FamilyService {
  constructor(private readonly db: PrismaService) {}

  private async authorize(id: string, actor: CurrentUser, write = false) {
    id = id.toLowerCase();
    if (id !== 'me' && !isUUID(id))
      throw new BadRequestException('Membro inválido');
    const account = await this.db.user.findUnique({
      where: { id: actor.id },
      select: { memberId: true },
    });
    const memberId = id === 'me' ? account?.memberId : id;
    if (!memberId) throw new NotFoundException('Membro não encontrado');
    if (
      memberId !== account?.memberId &&
      !actor.permissions.includes(write ? 'MEMBER_UPDATE' : 'MEMBER_READ')
    )
      throw new ForbiddenException();
    const member = await this.db.member.findFirst({
      where: { id: memberId, anonymizedAt: null },
    });
    if (
      !member ||
      (memberId === account?.memberId && member.status !== 'ACTIVE')
    )
      throw new NotFoundException('Membro ativo não encontrado');
    return memberId;
  }

  async list(id: string, actor: CurrentUser) {
    const memberId = await this.authorize(id, actor);
    const links = await this.db.memberRelationship.findMany({
      where: {
        OR: [{ firstId: memberId }, { secondId: memberId }],
        first: { anonymizedAt: null },
        second: { anonymizedAt: null },
      },
      include: {
        first: { select: relativeSelect },
        second: { select: relativeSelect },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return links.map((link) => ({
      id: link.id,
      relation: link.firstId === memberId ? link.secondRole : link.firstRole,
      parentRole: link.firstId === memberId ? link.firstRole : link.secondRole,
      member: link.firstId === memberId ? link.second : link.first,
    }));
  }

  async search(id: string, search: string | undefined, actor: CurrentUser) {
    const memberId = await this.authorize(id, actor, true);
    if (!search?.trim() || search.trim().length < 2) return [];
    return this.db.member.findMany({
      where: {
        id: { not: memberId },
        status: 'ACTIVE',
        anonymizedAt: null,
        name: { contains: search.trim(), mode: 'insensitive' },
        OR: [{ user: null }, { user: { status: 'ACTIVE', deletedAt: null } }],
      },
      select: { id: true, name: true },
      take: 20,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async save(id: string, dto: FamilyDto, actor: CurrentUser) {
    const memberId = await this.authorize(id, actor, true);
    if (dto.memberId === memberId)
      throw new BadRequestException(
        'Não é possível vincular o membro a si mesmo',
      );
    if (dto.memberId && dto.createAccount)
      throw new BadRequestException(
        'Selecione um membro existente ou cadastre um novo familiar',
      );
    if (!dto.memberId && dto.birthDate! > new Date().toISOString().slice(0, 10))
      throw new BadRequestException(
        'A data de nascimento não pode estar no futuro',
      );
    const passwordHash =
      !dto.memberId && dto.createAccount
        ? await argon2.hash(dto.password!, { type: argon2.argon2id })
        : undefined;
    try {
      await this.db.$transaction(async (tx) => {
        await bindAudit(tx);
        const ids = [memberId, ...(dto.memberId ? [dto.memberId] : [])].sort();
        // Lock both people in the same order, including privacy operations on them.
        for (const personId of ids)
          await tx.$queryRaw`SELECT id FROM members WHERE id=${personId}::uuid FOR UPDATE`;
        const owner = await tx.member.findFirst({
          where: { id: memberId, anonymizedAt: null },
        });
        if (!owner) throw new NotFoundException('Membro não encontrado');
        const existingLink = dto.memberId
          ? await tx.memberRelationship.findUnique({
              where: {
                firstId_secondId: { firstId: ids[0]!, secondId: ids[1]! },
              },
            })
          : null;
        const relative = dto.memberId
          ? await tx.member.findFirst({
              where: {
                id: dto.memberId,
                anonymizedAt: null,
                ...(!existingLink
                  ? {
                      status: 'ACTIVE',
                      OR: [
                        { user: null },
                        { user: { status: 'ACTIVE', deletedAt: null } },
                      ],
                    }
                  : {}),
              },
            })
          : await tx.member.create({
              data: {
                name: dto.name!,
                birthDate: new Date(dto.birthDate!),
                email: dto.email ?? null,
                phone: dto.phone ?? null,
                withoutAccount: !dto.createAccount,
                ...(passwordHash
                  ? {
                      user: {
                        create: {
                          name: dto.name!,
                          email: dto.email!,
                          passwordHash,
                          status: 'PENDING_APPROVAL',
                        },
                      },
                    }
                  : {}),
              },
            });
        if (!relative)
          throw new NotFoundException('Membro disponível não encontrado');
        const ownerRole =
          dto.relation === 'CHILD'
            ? dto.parentRole!
            : dto.relation === 'SPOUSE'
              ? 'SPOUSE'
              : 'CHILD';
        const first = memberId < relative.id;
        await tx.memberRelationship.upsert({
          where: {
            firstId_secondId: {
              firstId: first ? memberId : relative.id,
              secondId: first ? relative.id : memberId,
            },
          },
          create: {
            firstId: first ? memberId : relative.id,
            secondId: first ? relative.id : memberId,
            firstRole: first ? ownerRole : dto.relation,
            secondRole: first ? dto.relation : ownerRole,
          },
          update: {
            firstRole: first ? ownerRole : dto.relation,
            secondRole: first ? dto.relation : ownerRole,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'E-mail ou vínculo já cadastrado. Selecione o membro existente.',
        );
      throw error;
    }
    return { success: true };
  }

  async remove(id: string, linkId: string, actor: CurrentUser) {
    const memberId = await this.authorize(id, actor, true);
    await this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      const result = await tx.memberRelationship.deleteMany({
        where: {
          id: linkId,
          OR: [{ firstId: memberId }, { secondId: memberId }],
        },
      });
      if (!result.count) throw new NotFoundException('Vínculo não encontrado');
    });
  }
}
