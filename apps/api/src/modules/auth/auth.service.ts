import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PERMISSIONS, type CurrentUser } from '@church/shared';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { ChangePasswordDto, RegisterDto, ResetPasswordDto } from './auth.dto';
import { PasswordResetDelivery } from './password-reset.delivery';

const userInclude = {
  userRoles: {
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  },
} satisfies Prisma.UserInclude;
type Identity = Prisma.UserGetPayload<{ include: typeof userInclude }>;
export const safeUser = (user: Identity): CurrentUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  status: user.status,
  permissions: PERMISSIONS.filter((code) =>
    user.userRoles.some(({ role }) =>
      role.permissions.some(({ permission }) => permission.code === code),
    ),
  ),
});
const ACCESS_TTL_SECONDS = 900;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
export const RECOVERY_MESSAGE = {
  message:
    'Se a conta estiver ativa, as instruções serão enviadas quando a entrega de e-mail estiver disponível.',
};

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
    private readonly delivery: PasswordResetDelivery,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    if (
      [this.accessSecret, this.refreshSecret].some(
        (secret) => secret.length < 32 || secret.startsWith('replace-with-'),
      ) ||
      this.accessSecret === this.refreshSecret
    ) {
      throw new Error(
        'Configure distinct random JWT secrets with at least 32 characters',
      );
    }
    this.dummyHash = argon2.hash(randomBytes(32), { type: argon2.argon2id });
  }

  hashToken(token: string) {
    return createHmac('sha256', this.refreshSecret).update(token).digest('hex');
  }

  async register(dto: RegisterDto) {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    try {
      const user = await this.db.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          status: 'ACTIVE',
          userRoles: {
            create: {
              role: {
                connectOrCreate: {
                  where: { name: 'MEMBER' },
                  create: { name: 'MEMBER' },
                },
              },
            },
          },
        },
        include: userInclude,
      });
      return safeUser(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('E-mail já cadastrado');
      throw error;
    }
  }

  async login(email: string, password: string) {
    const user = await this.db.user.findUnique({
      where: { email },
      include: userInclude,
    });
    const valid = await argon2.verify(
      user?.passwordHash ?? (await this.dummyHash),
      password,
    );
    if (!valid || !user || user.status !== 'ACTIVE' || user.deletedAt)
      throw new UnauthorizedException('Credenciais inválidas');
    const token = randomBytes(32).toString('base64url');
    const session = await this.db.$transaction(async (tx) => {
      // Serialize session creation with password/status changes.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: userInclude,
      });
      if (
        current.passwordHash !== user.passwordHash ||
        current.status !== 'ACTIVE' ||
        current.deletedAt
      )
        throw new UnauthorizedException();
      const refresh = await tx.refreshToken.create({
        data: {
          userId: current.id,
          familyId: randomUUID(),
          tokenHash: this.hashToken(token),
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        },
      });
      return { user: current, refresh };
    });
    return this.tokens(session.user, session.refresh.id, token);
  }

  private async tokens(
    user: Identity,
    sessionId: string,
    refreshToken: string,
  ) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, sid: sessionId },
      {
        secret: this.accessSecret,
        expiresIn: ACCESS_TTL_SECONDS,
        algorithm: 'HS256',
        issuer: 'church-api',
        audience: 'church-web',
      },
    );
    return { accessToken, user: safeUser(user), refreshToken };
  }

  async authenticate(token: string) {
    let claims: { sub: string; sid: string };
    try {
      claims = await this.jwt.verifyAsync<{ sub: string; sid: string }>(token, {
        secret: this.accessSecret,
        algorithms: ['HS256'],
        issuer: 'church-api',
        audience: 'church-web',
      });
    } catch {
      throw new UnauthorizedException('Sessão inválida');
    }
    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string')
      throw new UnauthorizedException();
    const session = await this.db.refreshToken.findUnique({
      where: { id: claims.sid },
      include: { user: { include: userInclude } },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE' ||
      session.user.deletedAt
    )
      throw new UnauthorizedException('Sessão expirada');
    return { user: safeUser(session.user), sessionId: session.id };
  }

  async refresh(token: string) {
    const nextToken = randomBytes(32).toString('base64url');
    const result = await this.db.$transaction(async (tx) => {
      const session = await tx.refreshToken.findUnique({
        where: { tokenHash: this.hashToken(token) },
      });
      if (!session) return null;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.userId}::uuid FOR UPDATE`;
      const current = await tx.refreshToken.findUniqueOrThrow({
        where: { id: session.id },
      });
      const user = await tx.user.findUniqueOrThrow({
        where: { id: session.userId },
        include: userInclude,
      });
      if (current.revokedAt) {
        await tx.refreshToken.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      if (
        current.expiresAt <= new Date() ||
        user.status !== 'ACTIVE' ||
        user.deletedAt
      )
        return null;
      await tx.refreshToken.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      const next = await tx.refreshToken.create({
        data: {
          userId: user.id,
          familyId: session.familyId,
          tokenHash: this.hashToken(nextToken),
          // Absolute family lifetime: rotation cannot extend the original session forever.
          expiresAt: session.expiresAt,
        },
      });
      return { user, next };
    });
    if (!result) throw new UnauthorizedException('Sessão inválida');
    return this.tokens(result.user, result.next.id, nextToken);
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.db.$transaction(async (tx) => {
      const session = await tx.refreshToken.findUnique({
        where: { tokenHash: this.hashToken(token) },
      });
      if (!session) return;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.userId}::uuid FOR UPDATE`;
      await tx.refreshToken.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (
        user.status !== 'ACTIVE' ||
        user.deletedAt ||
        !(await argon2.verify(user.passwordHash, dto.currentPassword))
      )
        throw new UnauthorizedException('Senha atual inválida');
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.passwordReset.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });
    });
  }

  async forgotPassword(email: string) {
    const user = await this.db.user.findUnique({ where: { email } });
    if (user?.status === 'ACTIVE' && !user.deletedAt) {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + RESET_TTL_MS);
      const queued = await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
        const current = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
        });
        if (current.status !== 'ACTIVE' || current.deletedAt) return false;
        await tx.passwordReset.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.passwordReset.create({
          data: {
            userId: user.id,
            tokenHash: this.hashToken(token),
            expiresAt,
          },
        });
        return true;
      });
      if (queued)
        await this.delivery.send({ email: user.email, token, expiresAt });
    }
    return RECOVERY_MESSAGE;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.db.$transaction(async (tx) => {
      const reset = await tx.passwordReset.findUnique({
        where: { tokenHash: this.hashToken(dto.token) },
      });
      if (!reset) throw new UnauthorizedException('Token inválido ou expirado');
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${reset.userId}::uuid FOR UPDATE`;
      const current = await tx.passwordReset.findUniqueOrThrow({
        where: { id: reset.id },
        include: { user: true },
      });
      if (
        current.usedAt ||
        current.expiresAt <= new Date() ||
        current.user.status !== 'ACTIVE' ||
        current.user.deletedAt
      )
        throw new UnauthorizedException('Token inválido ou expirado');
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });
      await tx.passwordReset.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }
}
