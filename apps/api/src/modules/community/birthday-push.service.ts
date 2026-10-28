import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PushService } from '../operations/push.service';

@Injectable()
export class BirthdayPushService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(BirthdayPushService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.deliver().catch(() =>
        this.logger.error('Falha no envio dos aniversariantes.'),
      );
    }, 60 * 60_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async deliver() {
    if (this.running || !this.push.settings().enabled) return;
    this.running = true;
    try {
      // A database claim prevents repeats across restarts and multiple API replicas.
      const birthdays = await this.db.$transaction(async (tx) => {
        const claimed = await tx.$queryRaw<{ day: Date }[]>`
          INSERT INTO birthday_push_days(day)
          SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Lisbon')::date
          WHERE EXTRACT(HOUR FROM CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Lisbon') >= 9
          ON CONFLICT DO NOTHING RETURNING day
        `;
        if (!claimed.length) return null;
        return tx.$queryRaw<{ id: string; name: string }[]>`
          SELECT id, name FROM members
          WHERE status = 'ACTIVE' AND anonymized_at IS NULL
            AND EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Lisbon')
            AND EXTRACT(DAY FROM birth_date) = EXTRACT(DAY FROM CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Lisbon')
          ORDER BY name, id
        `;
      });
      if (!birthdays?.length) return;
      const users = await this.db.user.findMany({
        where: { status: 'ACTIVE', deletedAt: null, pushBirthdays: true },
        select: { id: true, memberId: true },
      });
      const birthdayIds = new Set(birthdays.map((member) => member.id));
      const celebrants = users.filter(
        (user) => user.memberId && birthdayIds.has(user.memberId),
      );
      const others = users.filter(
        (user) => !user.memberId || !birthdayIds.has(user.memberId),
      );
      await this.push.notifyUsers(
        celebrants.map((user) => user.id),
        'pushBirthdays',
        'Feliz aniversário!',
        'Feliz aniversário! Deus abençoe seu dia! ',
        '/',
      );
      // Bound the payload even when many members share the same birthday.
      const names = birthdays.map((member) => member.name);
      let summary = '';
      let count = 0;
      for (const name of names) {
        if (Buffer.byteLength(summary + name, 'utf8') > 1800) break;
        summary += (summary ? ', ' : '') + name;
        count++;
      }
      if (count < names.length) summary += ` e mais ${names.length - count}`;
      await this.push.notifyUsers(
        others.map((user) => user.id),
        'pushBirthdays',
        'Aniversariantes do dia',
        `Hoje celebramos: ${summary}.`,
        '/',
      );
    } finally {
      this.running = false;
    }
  }
}
