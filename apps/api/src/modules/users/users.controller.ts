import { canApproveRegistrations } from '@church/shared';
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
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import {
  IsIn,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsUUID,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateAccountDto } from '../auth/auth.dto';
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
class AccessPasswordDto {
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
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

  @Get('pending-approvals')
  async pendingApprovals(@Req() req: AuthRequest, @Query() query: PageQuery) {
    if (!canApproveRegistrations(req.user)) throw new ForbiddenException();
    const { page, pageSize, search } = query;
    const where: Prisma.UserWhereInput = {
      status: 'PENDING_APPROVAL',
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.user.findMany({
          where,
          select: {
            ...userSelect,
            createdAt: true,
            member: { select: { phone: true, birthDate: true } },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        this.db.user.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total, page, pageSize };
  }

  @Post(':id/approve')
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    if (!canApproveRegistrations(req.user)) throw new ForbiddenException();
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id } });
      if (!user || user.deletedAt)
        throw new NotFoundException('Usuário não encontrado');
      if (user.status !== 'PENDING_APPROVAL')
        throw new ConflictException('Esta conta não está aguardando aprovação');
      // Approval grants ordinary member access, never previously assigned elevated roles.
      await tx.userRole.deleteMany({ where: { userId: id } });
      return tx.user.update({
        where: { id },
        data: { status: 'ACTIVE' },
        select: userSelect,
      });
    });
  }

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
  create(@Body() dto: CreateAccountDto) {
    return this.auth.createAccount(dto);
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
      if (user.status === 'PENDING_APPROVAL')
        throw new ConflictException(
          'Use a lista de espera para aprovar esta conta',
        );
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
  @Get('roles')
  @Permission('PERMISSION_MANAGE')
  async availableRoles(@Req() req: AuthRequest) {
    const roles = await this.db.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
    return roles.map((role) => ({
      displayName: role.displayName ?? role.name,
      id: role.id,
      name: role.name,
      assignable: role.permissions.every(({ permission }) =>
        req.user.permissions.some((code) => code === permission.code),
      ),
    }));
  }

  @Get(':id/roles')
  @Permission('PERMISSION_MANAGE')
  async currentRoles(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.db.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        userRoles: { select: { role: { select: { id: true, name: true } } } },
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user.userRoles.map(({ role }) => role);
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
  @Post(':id/password')
  @Permission('USER_UPDATE')
  async password(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccessPasswordDto,
    @Req() req: AuthRequest,
  ) {
    const administrator =
      req.user.roles?.some(
        (role) => role === 'ADMIN' || role === 'SUPER_ADMIN',
      ) ?? false;
    if (!administrator && id === req.user.id)
      throw new ConflictException('Use a alteração de senha da sua conta.');
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
      const target = await tx.user.findUnique({
        where: { id },
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
      if (!target || target.deletedAt) throw new NotFoundException();
      if (
        !administrator &&
        target.userRoles.some(({ role }) =>
          role.permissions.some(
            ({ permission }) =>
              !req.user.permissions.some((p) => p === permission.code),
          ),
        )
      )
        throw new ForbiddenException();
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.passwordReset.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: new Date() },
      });
      return { id };
    });
  }
  @Patch(':id/member')
  @Permission('PERMISSION_MANAGE', 'MEMBER_READ')
  async link(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkMemberDto,
  ) {
    const account = await this.db.user.findUnique({
      where: { id },
      select: { memberId: true },
    });
    if (!account) throw new NotFoundException();
    if (!dto.memberId || dto.memberId !== account.memberId)
      throw new ConflictException(
        'Membro e conta são um único cadastro; o vínculo não pode ser removido ou trocado.',
      );
    return { id, memberId: account.memberId };
  }
}
