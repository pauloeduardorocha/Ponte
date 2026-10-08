import { bindAudit } from '../audit/audit-context';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    const member = await this.db.member.findUnique({ where: { id } });
    if (!member) throw new NotFoundException('Membro não encontrado');
    return member;
  }

  create(dto: CreateMemberDto) {
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      return tx.member.create({
        data: {
          ...dto,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        },
      });
    });
  }

  async update(id: string, dto: UpdateMemberDto) {
    try {
      return await this.db.$transaction(async (tx) => {
        await bindAudit(tx);
        await tx.$queryRaw`SELECT id FROM members WHERE id=${id}::uuid FOR UPDATE`;
        const existing = await tx.member.findUnique({ where: { id } });
        if (existing?.anonymizedAt)
          throw new ConflictException(
            'Perfil anonimizado; não pode receber novos dados pessoais',
          );
        return tx.member.update({
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
