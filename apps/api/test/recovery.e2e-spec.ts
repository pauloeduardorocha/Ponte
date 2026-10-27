import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../src/modules/finance/storage.service';
import { PrismaService } from '../src/database/prisma.service';

const recovery =
  process.env.RECOVERY_DRILL === 'true' ? describe : describe.skip;

recovery('Documents recovered from an encrypted database backup', () => {
  let db: PrismaClient;
  const content = Buffer.from('255044462d312e370a00ff', 'hex');
  beforeAll(() => {
    const url = new URL(process.env.DB_SECURITY_TEST_RUNTIME_URL!);
    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/ponte_restore_drill'
    ) {
      throw new Error(
        'Recovery verification requires the disposable restore database',
      );
    }
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it('reads the exact private document bytes through application storage with the restricted login', async () => {
    const storage = new StorageService(
      new ConfigService({ PRIVATE_STORAGE_DRIVER: 'database' }),
      db as PrismaService,
    );
    await expect(
      storage.get('00000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual(content);
  });

  it('preserves the schedule attachment metadata, relation and binary content', async () => {
    const attachment = await db.scheduleAttachment.findUniqueOrThrow({
      where: { id: '00000000-0000-4000-8000-000000000003' },
      include: { schedule: true },
    });
    expect(Buffer.from(attachment.content)).toEqual(content);
    expect(attachment.filename).toBe('drill.pdf');
    expect(attachment.size).toBe(content.length);
    expect(attachment.schedule.title).toBe('Recovery drill');
  });
});
