import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsIn } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { RegisterDto } from '../auth/auth.dto';
import { AuthRequest } from '../auth/auth.guard';
import { Permission } from '../auth/permission.decorator';
import { PageQuery } from '../members/member.dto';

class StatusDto {
  @IsIn(['ACTIVE', 'DISABLED'])
  status!: 'ACTIVE' | 'DISABLED';
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
} satisfies Prisma.UserSelect;

@Controller('users')
export class UsersController {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @Permission('USER_READ')
  async list(@Query() query: PageQuery) {
    const { page, pageSize, search } = query;
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.user.findMany({
          where,
          select: userSelect,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
        this.db.user.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total, page, pageSize };
  }

  @Post()
  @Permission('USER_CREATE')
  create(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Patch(':id/status')
  @Permission('USER_UPDATE')
  async status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
    @Req() request: AuthRequest,
  ) {
    if (id === request.user.id && dto.status === 'DISABLED')
      throw new ConflictException(
        'Não é permitido desativar sua própria conta',
      );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id } });
      if (!user || user.deletedAt)
        throw new NotFoundException('Usuário não encontrado');
      const result = await tx.user.update({
        where: { id },
        data: { status: dto.status },
        select: userSelect,
      });
      if (dto.status === 'DISABLED') {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.passwordReset.updateMany({
          where: { userId: id, usedAt: null },
          data: { usedAt: new Date() },
        });
      }
      return result;
    });
  }
}
