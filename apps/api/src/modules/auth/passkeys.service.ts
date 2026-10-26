import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from './auth.service';
import { auditRequestFields, bindAudit } from '../audit/audit-context';

@Injectable()
export class PasskeysService {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  origin(value: string | undefined) {
    const allowed = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!value || !allowed.includes(value))
      throw new ForbiddenException('Origem inválida');
    const url = new URL(value);
    if (
      url.origin !== value ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          url.hostname === 'localhost' &&
          this.config.get('NODE_ENV') !== 'production'
        ))
    )
      throw new ForbiddenException('HTTPS obrigatório');
    return value;
  }

  private rpID(origin: string) {
    return new URL(origin).hostname;
  }

  private async challenge(
    challenge: string,
    purpose: string,
    origin: string,
    userId?: string,
  ) {
    await this.db.passkeyChallenge.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return this.db.passkeyChallenge.create({
      data: {
        challenge,
        purpose,
        origin,
        userId,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
  }

  private async consume(
    id: string,
    purpose: string,
    origin: string,
    userId?: string,
  ) {
    // DELETE RETURNING atomically consumes the challenge even when verification fails.
    const rows = await this.db.$queryRaw<
      { challenge: string }[]
    >`DELETE FROM passkey_challenges WHERE id = ${id}::uuid AND purpose = ${purpose} AND origin = ${origin} AND "expiresAt" > NOW() AND ("userId" IS NOT DISTINCT FROM ${userId ?? null}::uuid) RETURNING challenge`;
    if (!rows[0])
      throw new UnauthorizedException('Pedido expirado. Tente novamente.');
    return rows[0].challenge;
  }

  list(userId: string) {
    return this.db.passkey.findMany({
      where: { userId },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async registrationOptions(userId: string, password: string, origin: string) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (
      !['ACTIVE', 'PENDING_APPROVAL'].includes(user.status) ||
      user.deletedAt ||
      !(await argon2.verify(user.passwordHash, password))
    )
      throw new UnauthorizedException('Senha atual inválida');
    const credentials = await this.db.passkey.findMany({
      where: { userId },
      select: { id: true },
    });
    const options = await generateRegistrationOptions({
      rpName: 'Ponte',
      rpID: this.rpID(origin),
      userID: new TextEncoder().encode(userId),
      userName: user.email,
      userDisplayName: user.name || user.email,
      attestationType: 'none',
      excludeCredentials: credentials,
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      timeout: 60_000,
    });
    const record = await this.challenge(
      options.challenge,
      'register',
      origin,
      userId,
    );
    return { challengeId: record.id, options };
  }

  async register(
    userId: string,
    challengeId: string,
    response: RegistrationResponseJSON,
    name: string,
    origin: string,
  ) {
    const challenge = await this.consume(
      challengeId,
      'register',
      origin,
      userId,
    );
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: this.rpID(origin),
        requireUserVerification: true,
      });
    } catch {
      throw new UnauthorizedException('Não foi possível validar a passkey');
    }
    if (!verification.verified || !verification.registrationInfo)
      throw new UnauthorizedException();
    const { credential } = verification.registrationInfo;
    await this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (
        !['ACTIVE', 'PENDING_APPROVAL'].includes(user.status) ||
        user.deletedAt
      )
        throw new UnauthorizedException();
      await tx.passkey.create({
        data: {
          id: credential.id,
          userId,
          name,
          publicKey: Buffer.from(credential.publicKey),
          counter: BigInt(credential.counter),
          transports: credential.transports ?? [],
        },
      });
      await tx.auditLog.create({
        data: {
          ...auditRequestFields(),
          userId,
          action: 'AUTH_PASSKEY_REGISTER',
          entity: 'User',
          entityId: userId,
        },
      });
    });
    return { message: 'Passkey ativada.' };
  }

  async authenticationOptions(origin: string) {
    const options = await generateAuthenticationOptions({
      rpID: this.rpID(origin),
      userVerification: 'required',
      timeout: 60_000,
    });
    const record = await this.challenge(options.challenge, 'login', origin);
    return { challengeId: record.id, options };
  }

  async login(
    challengeId: string,
    response: AuthenticationResponseJSON,
    origin: string,
  ) {
    const challenge = await this.consume(challengeId, 'login', origin);
    if (
      typeof response.id !== 'string' ||
      !response.id ||
      response.id.length > 2048 ||
      !response.response ||
      typeof response.response !== 'object'
    )
      throw new UnauthorizedException('Passkey inválida');
    const credential = await this.db.passkey.findUnique({
      where: { id: response.id },
    });
    if (!credential) throw new UnauthorizedException('Passkey inválida');
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: this.rpID(origin),
        requireUserVerification: true,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(credential.publicKey),
          counter: Number(credential.counter),
        },
      });
    } catch {
      throw new UnauthorizedException('Passkey inválida');
    }
    if (!verification.verified) throw new UnauthorizedException();
    if (
      response.response.userHandle &&
      response.response.userHandle !==
        Buffer.from(credential.userId).toString('base64url')
    )
      throw new UnauthorizedException();
    return this.auth.loginWithPasskey(
      credential.id,
      credential.counter,
      verification.authenticationInfo.newCounter,
    );
  }

  async remove(userId: string, id: string) {
    await this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const deleted = await tx.passkey.deleteMany({ where: { userId, id } });
      if (deleted.count)
        await tx.auditLog.create({
          data: {
            ...auditRequestFields(),
            userId,
            action: 'AUTH_PASSKEY_DELETE',
            entity: 'User',
            entityId: userId,
          },
        });
    });
  }
}
