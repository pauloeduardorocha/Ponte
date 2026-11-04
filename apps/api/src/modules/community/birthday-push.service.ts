import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PushService } from '../operations/push.service';

@Injectable()
export class BirthdayPushService {
  private running = false;
  constructor(
    private readonly db: PrismaService,
    private readonly push: PushService,
  ) {}

  async deliver() {
    if (this.running) return { status: 'running' as const };
    if (!this.push.settings().enabled) return { status: 'disabled' as const };
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
      if (!birthdays) return { status: 'skipped' as const };
      if (!birthdays.length) return { status: 'processed' as const, celebrants: 0 };
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
      return { status: 'processed' as const, celebrants: birthdays.length };
    } finally {
      this.running = false;
    }
  }
}
