import { Logger } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { LibraryService } from '../src/modules/library/library.service';

describe('Library maintenance lifecycle', () => {
  it('runs periodically, logs failures and releases its own timer on shutdown', async () => {
    jest.useFakeTimers();
    const db = new PrismaService();
    const transaction = jest
      .spyOn(db, '$transaction')
      .mockRejectedValue(new Error('Database unavailable'));
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const library = new LibraryService(db);
    try {
      library.onModuleInit();
      expect(jest.getTimerCount()).toBe(1);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith(
        'Library overdue/reservation maintenance failed',
        expect.any(Error),
      );
      library.onModuleDestroy();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      library.onModuleDestroy();
      transaction.mockRestore();
      error.mockRestore();
      jest.useRealTimers();
      await db.$disconnect();
    }
  });
});
