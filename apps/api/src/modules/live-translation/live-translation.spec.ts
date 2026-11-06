import { createHash } from 'node:crypto';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  LiveTranslationService,
  localAudienceUrl,
} from './live-translation.service';

describe('Live translation discovery and publication', () => {
  const token = 'a'.repeat(64),
    hash = createHash('sha256').update(token).digest('hex');
  const dto = {
    sessionId: '11111111-1111-4111-8111-111111111111',
    audienceUrl: `http://192.168.1.20:3210/listen/${'a'.repeat(24)}`,
  };
  const db = {
    liveTranslation: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const service = new LiveTranslationService(db as unknown as PrismaService);
  beforeEach(() => {
    jest.resetAllMocks();
  });
  it('rejects external URLs, credentials and control page URLs', () => {
    for (const url of [
      'https://evil.test/listen/' + 'a'.repeat(24),
      'http://127.0.0.1:3210/listen/' + 'a'.repeat(24),
      'http://192.168.1.2:3210/presenter#secret',
      dto.audienceUrl + '?token=secret',
      dto.audienceUrl.replace('192.168.1.20', 'user:pass@192.168.1.20'),
    ])
      expect(() => localAudienceUrl(url)).toThrow();
    expect(localAudienceUrl(dto.audienceUrl)).toBe(dto.audienceUrl);
  });
  it('stores only the credential hash and revokes an existing publication', async () => {
    const result = await service.rotateCredential();
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    const write = db.liveTranslation.upsert.mock.calls[0]![0];
    expect(JSON.stringify(write)).not.toContain(result.token);
    expect(write.update).toMatchObject({
      audienceUrl: null,
      expiresAt: null,
      sessionId: null,
    });
  });
  it('returns no URL for an expired publication or secret fields for a live one', async () => {
    db.liveTranslation.findUnique.mockResolvedValue({
      audienceUrl: dto.audienceUrl,
      expiresAt: new Date(Date.now() - 1),
      deviceTokenHash: hash,
    });
    expect(await service.status()).toEqual({
      active: false,
      audienceUrl: null,
      expiresAt: null,
    });
    db.liveTranslation.findUnique.mockResolvedValue({
      audienceUrl: dto.audienceUrl,
      expiresAt: new Date(Date.now() + 120000),
      deviceTokenHash: hash,
    });
    expect(await service.status()).toMatchObject({
      active: true,
      audienceUrl: dto.audienceUrl,
    });
    expect(await service.status()).not.toHaveProperty('deviceTokenHash');
  });
  it('requires a valid device token and atomically scopes publication to its lease', async () => {
    await expect(service.publish(dto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    db.liveTranslation.findUnique.mockResolvedValue({ deviceTokenHash: hash });
    await expect(
      service.publish(dto, 'Bearer ' + 'b'.repeat(64)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    db.liveTranslation.updateMany.mockResolvedValue({ count: 1 });
    expect(await service.publish(dto, 'Bearer ' + token)).toMatchObject({
      active: true,
      audienceUrl: dto.audienceUrl,
    });
    expect(db.liveTranslation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deviceTokenHash: hash,
          OR: expect.arrayContaining([{ sessionId: dto.sessionId }]),
        }),
      }),
    );
    db.liveTranslation.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.publish(dto, 'Bearer ' + token),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('only unpublishes the matching device session', async () => {
    db.liveTranslation.findUnique.mockResolvedValue({ deviceTokenHash: hash });
    await service.unpublish(dto.sessionId, 'Bearer ' + token);
    expect(db.liveTranslation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'church',
          deviceTokenHash: hash,
          sessionId: dto.sessionId,
        },
      }),
    );
  });
});
