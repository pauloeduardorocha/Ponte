import { Prisma } from '@prisma/client';
import { LibraryService } from '../src/modules/library/library.service';

describe('Library system pushes', () => {
  function setup() {
    let committed = false;
    const loan = {
      id: 'loan',
      status: 'ACTIVE',
      dueAt: new Date('2000-01-01'),
      graceDays: 0,
      dailyFine: new Prisma.Decimal(0),
      fine: null,
      member: { user: { id: 'borrower' } },
      bookCopy: { book: { title: 'Livro' } },
    };
    const tx = {
      $executeRaw: jest.fn(),
      librarySettings: { upsert: jest.fn().mockResolvedValue({ holdDays: 2 }) },
      loan: {
        findMany: jest.fn().mockResolvedValue([loan]),
        update: jest.fn(async () => {
          loan.status = 'OVERDUE';
          return loan;
        }),
      },
      reservation: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn() },
    };
    const db = {
      $transaction: jest.fn(async (fn) => {
        committed = false;
        const result = await fn(tx);
        committed = true;
        return result;
      }),
    };
    const deliveredAfterCommit: boolean[] = [];
    const push = {
      notifyUsers: jest.fn(async () => {
        deliveredAfterCommit.push(committed);
      }),
    };
    return {
      tx,
      db,
      push,
      deliveredAfterCommit,
      service: new LibraryService(db as never, push as never),
    };
  }

  it('sends the overdue alert after commit once, despite repeated maintenance', async () => {
    const { service, push, deliveredAfterCommit } = setup();
    await service.getSettings();
    await service.getSettings();
    expect(push.notifyUsers).toHaveBeenCalledTimes(1);
    expect(deliveredAfterCommit).toEqual([true]);
    expect(push.notifyUsers).toHaveBeenCalledWith(
      ['borrower'],
      'pushLibraryOverdue',
      'Livro em atraso',
      expect.stringContaining('Livro'),
      '/',
    );
  });

  it('does not deliver an alert for a rolled-back transaction', async () => {
    const { service, db, push } = setup();
    db.$transaction.mockImplementationOnce(async (fn) => {
      await fn(setup().tx);
      throw new Error('Commit failed');
    });
    await expect(service.getSettings()).rejects.toThrow('Commit failed');
    expect(push.notifyUsers).not.toHaveBeenCalled();
  });

  it('notifies a reservation owner once when a copy is allocated', async () => {
    const { tx, service, push } = setup();
    tx.loan.findMany.mockResolvedValue([]);
    let waiting = true;
    const reservation = {
      id: 'reservation',
      memberId: 'member',
      member: { user: { id: 'reader' } },
      book: { title: 'Livro reservado' },
    };
    const reservationUpdate = jest.fn(async () => {
      waiting = false;
    });
    Object.assign(tx.reservation, { update: reservationUpdate });
    Object.assign(tx, {
      bookCopy: {
        findMany: jest.fn().mockResolvedValue([{ id: 'copy' }]),
        update: jest.fn(),
      },
    });
    tx.reservation.findMany.mockImplementation(async (args) => {
      if (args.distinct) return waiting ? [{ bookId: 'book' }] : [];
      if (args.where.bookId) return waiting ? [reservation] : [];
      return [];
    });
    await service.getSettings();
    await service.getSettings();
    expect(reservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READY', bookCopyId: 'copy' }),
      }),
    );
    expect(push.notifyUsers).toHaveBeenCalledTimes(1);
    expect(push.notifyUsers).toHaveBeenCalledWith(
      ['reader'],
      'pushLibraryReservationReady',
      'Reserva disponível',
      expect.stringContaining('Livro reservado'),
      '/',
    );
  });
});
