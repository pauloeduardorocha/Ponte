import {
  ApiTags,
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { bindAudit } from '../audit/audit-context';
import {
  Body,
  ConflictException,
  ForbiddenException,
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
import {
  IsIn,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsUUID,
  IsOptional,
} from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { RegisterDto } from '../auth/auth.dto';
import { AuthRequest } from '../auth/auth.guard';
import { Permission } from '../auth/permission.decorator';
import { PageQuery } from '../members/member.dto';

class UserRolesDto {
  @ApiProperty({
    type: [String],
    maxItems: 20,
    description: 'IDs UUID das roles',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}
class LinkMemberDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  memberId?: string | null;
}
class StatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'DISABLED'] })
  @IsIn(['ACTIVE', 'DISABLED'])
  status!: 'ACTIVE' | 'DISABLED';
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
} satisfies Prisma.UserSelect;

@ApiTags('Usuarios')
@ApiBearerAuth()
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
      await bindAudit(tx);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(71932003)`;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user || user.deletedAt)
        throw new NotFoundException('Usuário não encontrado');
      if (
        user.userRoles.some((r) => r.role.name === 'SUPER_ADMIN') &&
        !request.user.permissions.includes('PERMISSION_MANAGE')
      )
        throw new ForbiddenException();
      if (
        dto.status === 'DISABLED' &&
        user.userRoles.some((r) => r.role.name === 'SUPER_ADMIN') &&
        (await tx.user.count({
          where: {
            status: 'ACTIVE',
            deletedAt: null,
            userRoles: { some: { role: { name: 'SUPER_ADMIN' } } },
          },
        })) <= 1
      )
        throw new ConflictException('Preserve ao menos um administrador ativo');
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
  @Patch(':id/roles')
  @Permission('PERMISSION_MANAGE')
  async roles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UserRolesDto,
    @Req() req: AuthRequest,
  ) {
    if (id === req.user.id)
      throw new ConflictException(
        'Alterações na própria autorização exigem outro administrador',
      );
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(71932003)`;
      await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
      const target = await tx.user.findUnique({
        where: { id },
        include: { userRoles: { include: { role: true } } },
      });
      if (!target || target.deletedAt) throw new NotFoundException();
      const roles = await tx.role.findMany({
        where: { id: { in: dto.roleIds } },
        include: { permissions: { include: { permission: true } } },
      });
      if (roles.length !== dto.roleIds.length)
        throw new NotFoundException('Perfil inexistente');
      if (
        roles.some((r) =>
          r.permissions.some(
            (p) =>
              !req.user.permissions.some((code) => code === p.permission.code),
          ),
        )
      )
        throw new ForbiddenException(
          'Não pode delegar permissões superiores às suas',
        );
      if (
        target.userRoles.some((r) => r.role.name === 'SUPER_ADMIN') &&
        !roles.some((r) => r.name === 'SUPER_ADMIN') &&
        (await tx.user.count({
          where: {
            status: 'ACTIVE',
            deletedAt: null,
            userRoles: { some: { role: { name: 'SUPER_ADMIN' } } },
          },
        })) <= 1
      )
        throw new ConflictException('Preserve ao menos um administrador ativo');
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roles.map((r) => ({ userId: id, roleId: r.id })),
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { id, roles: roles.map((r) => ({ id: r.id, name: r.name })) };
    });
  }
  @Patch(':id/member')
  @Permission('PERMISSION_MANAGE', 'MEMBER_READ')
  async link(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkMemberDto,
  ) {
    try {
      return await this.db.$transaction(async (tx) => {
        await bindAudit(tx);
        if (
          dto.memberId &&
          !(await tx.member.findFirst({
            where: { id: dto.memberId, anonymizedAt: null },
          }))
        )
          throw new NotFoundException('Membro inexistente');
        await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id } });
        if (!user || user.deletedAt) throw new NotFoundException();
        if (dto.memberId === undefined)
          throw new ConflictException(
            'Informe o membro ou null para remover o vínculo',
          );
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return tx.user.update({
          where: { id },
          data: { memberId: dto.memberId },
          select: { ...userSelect, memberId: true },
        });
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException('Membro já vinculado a outro usuário');
      throw e;
    }
  }
}
