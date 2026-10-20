import { ConfigService } from '@nestjs/config';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from './auth.service';
import { PasskeysService } from './passkeys.service';
import { JwtService } from '@nestjs/jwt';
import { PendingEmailDelivery } from './password-reset.delivery';

describe('Passkey session issuance', () => {
  it.each([
    { status: 'DISABLED', deletedAt: null },
    { status: 'INVITED', deletedAt: null },
    { status: 'ACTIVE', deletedAt: new Date() },
  ])(
    'does not create sessions for an inactive or deleted account: %j',
    async (user) => {
      const tx = {
        $queryRaw: jest.fn(),
        passkey: {
          findUnique: jest.fn().mockResolvedValue({ userId: 'user' }),
          updateMany: jest.fn(),
        },
        user: { findUniqueOrThrow: jest.fn().mockResolvedValue(user) },
        refreshToken: { create: jest.fn() },
      };
      const db = {
        $transaction: (callback: (tx: unknown) => unknown) => callback(tx),
      };
      const auth = new AuthService(
        db as unknown as PrismaService,
        new JwtService(),
        new ConfigService({
          JWT_ACCESS_SECRET: 'a'.repeat(48),
          JWT_REFRESH_SECRET: 'b'.repeat(48),
        }),
        new PendingEmailDelivery(),
      );
      await expect(
        auth.loginWithPasskey('credential', 0n, 1),
      ).rejects.toThrow();
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
    },
  );
});

describe('Passkeys cryptographic verification', () => {
  const origin = 'https://ponte.example';
  const userId = '63b80123-eefa-4f48-a877-6cfdcdd4b724';
  const challenge = randomBytes(32).toString('base64url');
  const challengeId = '63b80123-eefa-4f48-a877-6cfdcdd4b725';
  const credentialId = randomBytes(32).toString('base64url');
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const jwk = publicKey.export({ format: 'jwk' });
  const coseKey = Buffer.concat([
    Buffer.from('a5010203262001215820', 'hex'),
    Buffer.from(jwk.x!, 'base64url'),
    Buffer.from('225820', 'hex'),
    Buffer.from(jwk.y!, 'base64url'),
  ]);
  const db = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    passkey: { findUnique: jest.fn(), create: jest.fn() },
    user: { findUniqueOrThrow: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const auth = { loginWithPasskey: jest.fn() };
  let service: PasskeysService;

  function assertion(
    overrides: {
      origin?: string;
      challenge?: string;
      flags?: number;
      rp?: string;
    } = {},
  ): AuthenticationResponseJSON {
    const client = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: overrides.challenge ?? challenge,
        origin: overrides.origin ?? origin,
      }),
    );
    const authenticatorData = Buffer.concat([
      createHash('sha256')
        .update(overrides.rp ?? 'ponte.example')
        .digest(),
      Buffer.from([overrides.flags ?? 5]),
      Buffer.from([0, 0, 0, 1]),
    ]);
    const signature = sign(
      'sha256',
      Buffer.concat([
        authenticatorData,
        createHash('sha256').update(client).digest(),
      ]),
      privateKey,
    );
    return {
      id: credentialId,
      rawId: credentialId,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: client.toString('base64url'),
        authenticatorData: authenticatorData.toString('base64url'),
        signature: signature.toString('base64url'),
        userHandle: Buffer.from(userId).toString('base64url'),
      },
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PasskeysService(
      db as unknown as PrismaService,
      auth as unknown as AuthService,
      new ConfigService({ CORS_ORIGIN: origin, NODE_ENV: 'production' }),
    );
    db.$queryRaw.mockResolvedValue([{ challenge }]);
    db.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(db),
    );
    db.passkey.findUnique.mockResolvedValue({
      id: credentialId,
      userId,
      publicKey: coseKey,
      counter: 0n,
    });
    db.user.findUniqueOrThrow.mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      deletedAt: null,
    });
    auth.loginWithPasskey.mockResolvedValue({ accessToken: 'session' });
  });

  it('accepts a real signed assertion and passes the verified counter to session creation', async () => {
    await expect(
      service.login(challengeId, assertion(), origin),
    ).resolves.toEqual({ accessToken: 'session' });
    expect(auth.loginWithPasskey).toHaveBeenCalledWith(credentialId, 0n, 1);
  });

  it.each([
    { origin: 'https://evil.example' },
    { challenge: 'different' },
    { flags: 1 },
    { rp: 'evil.example' },
  ])(
    'rejects a signed assertion with invalid origin, challenge, verification or RP: %j',
    async (overrides) => {
      await expect(
        service.login(challengeId, assertion(overrides), origin),
      ).rejects.toThrow();
      expect(auth.loginWithPasskey).not.toHaveBeenCalled();
    },
  );

  it('rejects an invalid signature', async () => {
    const response = assertion();
    response.response.signature = randomBytes(64).toString('base64url');
    await expect(
      service.login(challengeId, response, origin),
    ).rejects.toThrow();
    expect(auth.loginWithPasskey).not.toHaveBeenCalled();
  });

  it('rejects consumed/expired challenges before reading credentials', async () => {
    db.$queryRaw.mockResolvedValue([]);
    await expect(
      service.login(challengeId, assertion(), origin),
    ).rejects.toThrow('Pedido expirado');
    expect(db.passkey.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a userHandle that belongs to a different account', async () => {
    const response = assertion();
    response.response.userHandle =
      Buffer.from('another-user').toString('base64url');
    await expect(
      service.login(challengeId, response, origin),
    ).rejects.toThrow();
    expect(auth.loginWithPasskey).not.toHaveBeenCalled();
  });

  it('rejects unknown credentials and malformed responses', async () => {
    await expect(
      service.login(challengeId, {} as AuthenticationResponseJSON, origin),
    ).rejects.toThrow('Passkey inválida');
    db.passkey.findUnique.mockResolvedValue(null);
    await expect(
      service.login(challengeId, assertion(), origin),
    ).rejects.toThrow('Passkey inválida');
  });

  it('registers a valid none-attestation credential with user verification', async () => {
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.create', challenge, origin }),
    ).toString('base64url');
    const id = Buffer.from(credentialId, 'base64url');
    const authData = Buffer.concat([
      createHash('sha256').update('ponte.example').digest(),
      Buffer.from([0x45]),
      Buffer.alloc(4),
      Buffer.alloc(16),
      Buffer.from([0, id.length]),
      id,
      coseKey,
    ]);
    const attestation = isoCBOR.encode(
      new Map<string, string | Uint8Array | Map<string, string>>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    );
    const response: RegistrationResponseJSON = {
      id: credentialId,
      rawId: credentialId,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON,
        attestationObject: Buffer.from(attestation).toString('base64url'),
        transports: ['internal'],
      },
    };
    await service.register(userId, challengeId, response, 'Telemóvel', origin);
    expect(db.passkey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: credentialId,
        userId,
        counter: 0n,
        publicKey: coseKey,
      }),
    });
    db.user.findUniqueOrThrow.mockResolvedValue({ status: 'DISABLED' });
    await expect(
      service.register(userId, challengeId, response, 'Telemóvel', origin),
    ).rejects.toThrow();
  });

  it('only accepts an explicitly configured HTTPS origin', () => {
    expect(service.origin(origin)).toBe(origin);
    for (const value of [
      undefined,
      'https://evil.example',
      'http://ponte.example',
      origin + '/',
    ])
      expect(() => service.origin(value)).toThrow();
  });
});
