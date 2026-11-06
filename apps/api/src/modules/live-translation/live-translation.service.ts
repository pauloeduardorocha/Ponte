import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { PublishTranslationDto } from './live-translation.dto';

const id = 'church';
export function localAudienceUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('Endereço local inválido');
  }
  const octets = url.hostname.split('.').map(Number);
  const second = octets[1] ?? -1;
  const local =
    octets.length === 4 &&
    octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (octets[0] === 10 ||
      (octets[0] === 192 && second === 168) ||
      (octets[0] === 172 && second >= 16 && second <= 31));
  if (
    !local ||
    url.protocol !== 'http:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/listen\/[a-f0-9]{24}$/.test(url.pathname)
  )
    throw new BadRequestException(
      'Use o link da audiência na rede Wi-Fi da igreja',
    );
  return url.href;
}
@Injectable()
export class LiveTranslationService {
  constructor(private readonly db: PrismaService) {}
  async status() {
    const row = await this.db.liveTranslation.findUnique({
      where: { id },
      select: { audienceUrl: true, expiresAt: true },
    });
    return row?.audienceUrl &&
      row.expiresAt &&
      row.expiresAt.getTime() > Date.now()
      ? {
          active: true,
          audienceUrl: row.audienceUrl,
          expiresAt: row.expiresAt.toISOString(),
        }
      : { active: false, audienceUrl: null, expiresAt: null };
  }
  async rotateCredential() {
    const token = randomBytes(32).toString('hex');
    const data = {
      deviceTokenHash: this.hash(token),
      sessionId: null,
      audienceUrl: null,
      expiresAt: null,
    };
    await this.db.liveTranslation.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
    return { token };
  }
  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private async authorize(authorization?: string) {
    const token = /^Bearer ([a-f0-9]{64})$/.exec(authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException();
    const hash = this.hash(token);
    const row = await this.db.liveTranslation.findUnique({
      where: { id },
      select: { deviceTokenHash: true },
    });
    if (!row || row.deviceTokenHash !== hash) throw new UnauthorizedException();
    return hash;
  }
  async publish(dto: PublishTranslationDto, authorization?: string) {
    const hash = await this.authorize(authorization),
      audienceUrl = localAudienceUrl(dto.audienceUrl);
    const expiresAt = new Date(Date.now() + 120000);
    const result = await this.db.liveTranslation.updateMany({
      where: {
        id,
        deviceTokenHash: hash,
        OR: [
          { sessionId: dto.sessionId },
          { expiresAt: null },
          { expiresAt: { lte: new Date() } },
        ],
      },
      data: { sessionId: dto.sessionId, audienceUrl, expiresAt },
    });
    if (!result.count)
      throw new ConflictException(
        'Outra transmissão está publicada. Aguarde ou revogue a credencial na administração.',
      );
    return { active: true, audienceUrl, expiresAt: expiresAt.toISOString() };
  }
  async unpublish(sessionId: string, authorization?: string) {
    const hash = await this.authorize(authorization);
    await this.db.liveTranslation.updateMany({
      where: { id, deviceTokenHash: hash, sessionId },
      data: { sessionId: null, audienceUrl: null, expiresAt: null },
    });
    return { active: false };
  }
}
