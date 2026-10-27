import { BirdEmailService } from '../email/bird-email.service';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { requestTrace } from '../../common/request-trace';
import { CreateFrontendErrorDto } from './frontend-errors.dto';
import type { FrontendErrorNetwork } from './frontend-error-network';

const RETENTION_DAYS = 30;
const SENSITIVE = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /\b(?:PT\d{2})?\d{21}\b/gi,
  /([?&](?:token|code|email|iban|authorization|password)=)[^&#\s]*/gi,
];

function clean(value: string, max: number) {
  // Remove control bytes that can corrupt structured log output.
  let result = value.replace(
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
    ' ',
  );
  for (const pattern of SENSITIVE)
    result = result.replace(pattern, '[redacted]');
  return result.slice(0, max);
}

function cleanRoute(value: string) {
  try {
    const url = new URL(value, 'https://client.invalid');
    return clean(url.pathname, 512).replace(
      /\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,
      ':id',
    );
  } catch {
    return clean(value.split(/[?#]/, 1)[0] || '/', 512);
  }
}

@Injectable()
export class FrontendErrorsService {
  private lastCleanup = 0;
  private readonly logger = new Logger(FrontendErrorsService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly email: BirdEmailService,
    private readonly config: ConfigService,
  ) {}

  async create(
    dto: CreateFrontendErrorDto,
    userId?: string,
    network?: FrontendErrorNetwork,
  ) {
    const now = Date.now();
    if (now - this.lastCleanup > 6 * 60 * 60 * 1000) {
      this.lastCleanup = now;
      await this.db.frontendErrorReport
        .deleteMany({
          where: {
            createdAt: { lt: new Date(now - RETENTION_DAYS * 86400_000) },
          },
        })
        .catch(() => undefined);
    }
    const logs = (dto.logs ?? []).map((entry) => ({
      level: entry.level,
      at: entry.at ? new Date(entry.at).toISOString() : undefined,
      message: clean(entry.message, 500),
    }));
    const report = await this.db.frontendErrorReport.create({
      data: {
        userId,
        requestId: requestTrace.getStore()?.requestId ?? randomUUID(),
        clientRequestId: dto.clientRequestId
          ? clean(dto.clientRequestId, 128)
          : undefined,
        occurredAt: new Date(dto.occurredAt),
        eventType: dto.eventType,
        message: clean(dto.message, 2000),
        stack: dto.stack ? clean(dto.stack, 8000) : undefined,
        route: cleanRoute(dto.route),
        apiPath: dto.apiPath ? cleanRoute(dto.apiPath) : undefined,
        apiMethod: dto.apiMethod,
        apiStatus: dto.apiStatus,
        userAgent: dto.userAgent ? clean(dto.userAgent, 1024) : undefined,
        device: network
          ? { ...dto.device, network }
          : (dto.device as object | undefined),
        logs,
      },
    });
    if (dto.apiStatus === 401 || dto.apiStatus === 403) {
      return { accepted: true };
    }
    const to = this.config.get<string>('FRONTEND_ERROR_EMAIL_TO', '').trim();
    if (to && this.email.configured) {
      const escape = (value: string) =>
        value.replace(
          /[&<>"']/g,
          (char) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;',
            })[char]!,
        );
      const rows = Object.entries(report).map(([key, value]) => [
        key,
        value instanceof Date
          ? value.toISOString()
          : typeof value === 'object' && value !== null
            ? JSON.stringify(value, null, 2)
            : String(value ?? '—'),
      ]);
      try {
        await this.email.send({
          to,
          subject: 'Ponte — Novo erro de frontend',
          idempotencyKey: `frontend-error-${report.id}`,
          text: rows.map(([key, value]) => `${key}: ${value}`).join('\n'),
          html:
            '<h1>Novo erro de frontend</h1><table border="1" cellpadding="8" style="border-collapse:collapse"><thead><tr><th>Campo</th><th>Detalhes</th></tr></thead><tbody>' +
            rows
              .map(
                ([key, value]) =>
                  `<tr><th scope="row">${escape(key!)}</th><td style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(value!)}</td></tr>`,
              )
              .join('') +
            '</tbody></table>',
        });
      } catch {
        this.logger.warn(
          'Frontend error saved, but alert email delivery failed.',
        );
      }
    } else {
      this.logger.warn('Frontend error alert email is not configured.');
    }
    return { accepted: true };
  }
}
