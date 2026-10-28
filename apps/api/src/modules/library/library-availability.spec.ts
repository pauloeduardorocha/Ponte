import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { LibraryService } from './library.service';
import { BookAvailabilityQuery } from './library.dto';
import { LibraryController } from './library.controller';
import { PERMISSION_KEY } from '../auth/permission.decorator';

const id = '12345678-1234-4234-8234-123456789abc';
describe('Live book availability', () => {
  it('returns current inventory counts without loading catalogue text or users', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        {
          id,
          copies: [
            { status: 'AVAILABLE' },
            { status: 'LOANED' },
            { status: 'RESERVED' },
            { status: 'PENDING_INVENTORY' },
          ],
        },
      ]);
    const service = new LibraryService(
      { book: { findMany } } as unknown as PrismaService,
      {} as never,
    );
    await expect(service.bookAvailability([id])).resolves.toEqual([
      { bookId: id, quantity: 4, available: 1 },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: [id] } },
      select: { id: true, copies: { select: { status: true } } },
    });
  });
  it('validates bounded comma-separated UUIDs and keeps catalogue read permission', async () => {
    const query = plainToInstance(BookAvailabilityQuery, { ids: id });
    expect(await validate(query)).toHaveLength(0);
    expect(query.ids).toEqual([id]);
    expect(
      Reflect.getMetadata(
        PERMISSION_KEY,
        LibraryController.prototype.availability,
      ),
    ).toEqual(['LIBRARY_BOOK_READ']);
  });
  it.each(['', 'invalid', [], [id, id], Array.from({ length: 101 }, () => id)])(
    'rejects invalid or excessive book IDs: %p',
    async (ids) => {
      expect(
        await validate(plainToInstance(BookAvailabilityQuery, { ids })),
      ).not.toHaveLength(0);
    },
  );
});
