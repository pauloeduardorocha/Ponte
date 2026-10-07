import { Injectable, NotFoundException } from '@nestjs/common';
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
    return this.db.member.create({
      data: {
        ...dto,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      },
    });
  }

  async update(id: string, dto: UpdateMemberDto) {
    try {
      return await this.db.member.update({
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
    } catch (error) {
      this.rethrowMissing(error);
    }
  }

  async delete(id: string) {
    try {
      await this.db.member.delete({ where: { id } });
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
    throw error;
  }
}
