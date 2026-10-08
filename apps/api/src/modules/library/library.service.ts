import { bindAudit, auditRequestFields } from '../audit/audit-context';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  AdjustmentDto,
  BookDto,
  BookQuery,
  CloseLoanDto,
  CopyDto,
  CopyQuery,
  LibraryQuery,
  LoanDto,
  LoanQuery,
  PaymentDto,
  ReservationDto,
  SettingsDto,
  UpdateBookDto,
  UpdateCopyDto,
} from './library.dto';
import {
  ACTIVE_LOANS,
  addDays,
  outstanding,
  overdueDays,
} from './library.policy';

type Tx = Prisma.TransactionClient;
const loanInclude = {
  member: { select: { id: true, name: true } },
  bookCopy: { include: { book: true } },
} satisfies Prisma.LoanInclude;
const reservationInclude = {
  member: { select: { id: true, name: true } },
  book: true,
  bookCopy: true,
} satisfies Prisma.ReservationInclude;

@Injectable()
export class LibraryService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly logger = new Logger(LibraryService.name);

  constructor(private readonly db: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.transaction(async () => undefined).catch(() => {
        this.logger.error('Library overdue/reservation maintenance failed');
      });
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async transaction<T>(
    operation: (tx: Tx, now: Date) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await bindAudit(tx);
          // One shared transaction lock also serializes limits, queues and payments across replicas.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(716023, 1)`;
          const now = new Date();
          await this.synchronize(tx, now);
          return operation(tx, now);
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException(
            'Registro duplicado ou operação concorrente',
          );
        if (error.code === 'P2025')
          throw new NotFoundException('Registro não encontrado');
        if (error.code === 'P2003')
          throw new ConflictException('Registro possui histórico vinculado');
      }
      throw error;
    }
  }

  private audit(
    tx: Tx,
    userId: string | null,
    action: string,
    entity: string,
    entityId: string,
    metadata: Prisma.InputJsonValue = {},
  ) {
    return tx.auditLog.create({
      data: {
        ...auditRequestFields(),
        userId,
        action: `LIBRARY_${action}`,
        entity,
        entityId,
        metadata,
      },
    });
  }

  private settings(tx: Tx) {
    return tx.librarySettings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
  }

  private async synchronize(tx: Tx, now: Date) {
    const settings = await this.settings(tx);
    const active = await tx.loan.findMany({
      where: { status: { in: [...ACTIVE_LOANS] } },
      include: { fine: true },
    });
    for (const loan of active) {
      const days = overdueDays(loan.dueAt, now, loan.graceDays);
      if (days > 0 && loan.status !== 'OVERDUE') {
        await tx.loan.update({
          where: { id: loan.id },
          data: { status: 'OVERDUE' },
        });
        await this.audit(tx, null, 'OVERDUE', 'Loan', loan.id, { days });
      }
      const amount = loan.dailyFine.mul(days);
      if (amount.gt(0) && !loan.fine) {
        const fine = await tx.fine.create({
          data: { loanId: loan.id, amount },
        });
        await this.audit(tx, null, 'FINE_ACCRUE', 'Fine', fine.id, {
          amount: amount.toFixed(2),
          days,
        });
      } else if (
        loan.fine &&
        !['FORGIVEN', 'CANCELLED'].includes(loan.fine.status) &&
        amount.gt(loan.fine.amount)
      ) {
        await tx.fine.update({
          where: { id: loan.fine.id },
          data: {
            amount,
            status: amount.gt(loan.fine.paidAmount.plus(loan.fine.discount))
              ? 'OPEN'
              : 'PAID',
          },
        });
        await this.audit(tx, null, 'FINE_ACCRUE', 'Fine', loan.fine.id, {
          amount: amount.toFixed(2),
          days,
        });
      }
    }
    const expired = await tx.reservation.findMany({
      where: {
        OR: [
          { status: 'WAITING', expiresAt: { lte: now } },
          { status: 'READY', holdUntil: { lte: now } },
        ],
      },
    });
    for (const reservation of expired) {
      await this.releaseReservation(
        tx,
        reservation.id,
        reservation.bookCopyId,
        'EXPIRED',
        null,
      );
    }
    const books = await tx.reservation.findMany({
      where: { status: 'WAITING' },
      distinct: ['bookId'],
      select: { bookId: true },
    });
    for (const { bookId } of books)
      await this.promote(tx, bookId, now, settings.holdDays);
  }

  private async promote(tx: Tx, bookId: string, now: Date, holdDays: number) {
    const queue = await tx.reservation.findMany({
      where: { bookId, status: 'WAITING', expiresAt: { gt: now } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const copies = await tx.bookCopy.findMany({
      where: { bookId, status: 'AVAILABLE' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    for (let i = 0; i < Math.min(queue.length, copies.length); i++) {
      const reservation = queue[i]!;
      const copy = copies[i]!;
      await tx.bookCopy.update({
        where: { id: copy.id },
        data: { status: 'RESERVED' },
      });
      const holdUntil = addDays(now, holdDays);
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: 'READY', bookCopyId: copy.id, readyAt: now, holdUntil },
      });
      await this.audit(
        tx,
        null,
        'RESERVATION_READY',
        'Reservation',
        reservation.id,
        {
          bookCopyId: copy.id,
          memberId: reservation.memberId,
          holdUntil: holdUntil.toISOString(),
        },
      );
      await this.audit(tx, null, 'COPY_RESERVED', 'BookCopy', copy.id, {
        reservationId: reservation.id,
      });
    }
  }

  private async releaseReservation(
    tx: Tx,
    id: string,
    copyId: string | null,
    status: 'CANCELLED' | 'EXPIRED',
    actor: string | null,
  ) {
    await tx.reservation.update({ where: { id }, data: { status } });
    if (copyId) {
      await tx.bookCopy.update({
        where: { id: copyId },
        data: { status: 'AVAILABLE' },
      });
      await this.audit(tx, actor, 'COPY_RELEASED', 'BookCopy', copyId, {
        reservationId: id,
      });
    }
    await this.audit(tx, actor, `RESERVATION_${status}`, 'Reservation', id);
  }

  private async eligible(tx: Tx, memberId: string) {
    const member = await tx.member.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Membro não encontrado');
    if (member.status !== 'ACTIVE')
      throw new ConflictException('Membro inativo');
    const settings = await this.settings(tx);
    const active = await tx.loan.findMany({
      where: { memberId, status: { in: [...ACTIVE_LOANS] } },
    });
    if (active.length >= settings.maxBooks)
      throw new ConflictException('Limite de empréstimos atingido');
    if (
      settings.blockOverdue &&
      active.some((loan) => loan.status === 'OVERDUE')
    )
      throw new ConflictException('Membro possui empréstimo em atraso');
    return settings;
  }

  listBooks(query: BookQuery) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const where: Prisma.BookWhereInput = {
        author: query.author
          ? { contains: query.author, mode: 'insensitive' }
          : undefined,
        category: query.category
          ? { equals: query.category, mode: 'insensitive' }
          : undefined,
        ...(query.available
          ? {
              copies:
                query.available === 'true'
                  ? { some: { status: 'AVAILABLE' } }
                  : { none: { status: 'AVAILABLE' } },
            }
          : {}),
        ...(query.search
          ? {
              OR: [
                ...['title', 'subtitle', 'author', 'isbn', 'category'].map(
                  (field) => ({
                    [field]: { contains: query.search, mode: 'insensitive' },
                  }),
                ),
                { keywords: { has: query.search } },
              ],
            }
          : {}),
      };
      const books = await tx.book.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        include: { copies: { select: { status: true } } },
      });
      return {
        items: books.map(({ copies, ...book }) => ({
          ...book,
          quantity: copies.length,
          available: copies.filter((copy) => copy.status === 'AVAILABLE')
            .length,
        })),
        total: await tx.book.count({ where }),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  getBook(id: string) {
    return this.transaction(async (tx) =>
      tx.book.findUniqueOrThrow({ where: { id } }),
    );
  }

  createBook(dto: BookDto, actor: string) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const book = await tx.book.create({ data: dto });
      await this.audit(tx, actor, 'BOOK_CREATE', 'Book', book.id, {
        changes: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
      });
      return book;
    });
  }

  updateBook(id: string, dto: UpdateBookDto, actor: string) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const before = await tx.book.findUniqueOrThrow({ where: { id } });
      const book = await tx.book.update({ where: { id }, data: dto });
      await this.audit(tx, actor, 'BOOK_UPDATE', 'Book', id, {
        before: JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue,
        changes: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
      });
      return book;
    });
  }

  deleteBook(id: string, actor: string) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      await tx.book.delete({ where: { id } });
      await this.audit(tx, actor, 'BOOK_DELETE', 'Book', id);
    });
  }

  listCopies(query: CopyQuery) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const where: Prisma.BookCopyWhereInput = {
        bookId: query.bookId,
        status: query.status,
        ...(query.search
          ? {
              OR: ['assetCode', 'barcode', 'qrCode', 'location'].map(
                (field) => ({
                  [field]: { contains: query.search, mode: 'insensitive' },
                }),
              ),
            }
          : {}),
      };
      return {
        items: await tx.bookCopy.findMany({
          where,
          include: { book: true },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          orderBy: [{ assetCode: 'asc' }, { id: 'asc' }],
        }),
        total: await tx.bookCopy.count({ where }),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  copyHistory(id: string) {
    return this.transaction(async (tx) => ({
      copy: await tx.bookCopy.findUniqueOrThrow({
        where: { id },
        include: { book: true },
      }),
      loans: await tx.loan.findMany({
        where: { bookCopyId: id },
        include: {
          ...loanInclude,
          fine: { include: { payments: true, adjustments: true } },
        },
        orderBy: { borrowedAt: 'desc' },
      }),
      reservations: await tx.reservation.findMany({
        where: { bookCopyId: id },
        include: reservationInclude,
        orderBy: { createdAt: 'desc' },
      }),
      events: await tx.auditLog.findMany({
        where: { entity: 'BookCopy', entityId: id },
        orderBy: { createdAt: 'desc' },
      }),
    }));
  }

  createCopy(bookId: string, dto: CopyDto, actor: string) {
    return this.transaction(async (tx, now) => {
      await tx.book.findUniqueOrThrow({ where: { id: bookId } });
      const copy = await tx.bookCopy.create({
        data: {
          ...dto,
          bookId,
          acquiredAt: dto.acquiredAt ? new Date(dto.acquiredAt) : null,
        },
      });
      await this.audit(tx, actor, 'COPY_CREATE', 'BookCopy', copy.id);
      await this.promote(tx, bookId, now, (await this.settings(tx)).holdDays);
      return tx.bookCopy.findUniqueOrThrow({
        where: { id: copy.id },
        include: { book: true },
      });
    });
  }

  updateCopy(id: string, dto: UpdateCopyDto, actor: string) {
    return this.transaction(async (tx, now) => {
      const copy = await tx.bookCopy.findUniqueOrThrow({ where: { id } });
      if (
        dto.status &&
        (copy.status === 'LOANED' || copy.status === 'RESERVED')
      )
        throw new ConflictException(
          'Devolva o empréstimo ou cancele a reserva antes de alterar o status',
        );
      const { justification, acquiredAt, ...changes } = dto;
      await tx.bookCopy.update({
        where: { id },
        data: {
          ...changes,
          acquiredAt:
            acquiredAt === undefined
              ? undefined
              : acquiredAt
                ? new Date(acquiredAt)
                : null,
        },
      });
      await this.audit(tx, actor, 'COPY_UPDATE', 'BookCopy', id, {
        before: JSON.parse(JSON.stringify(copy)) as Prisma.InputJsonValue,
        changes: JSON.parse(
          JSON.stringify({ ...changes, acquiredAt }),
        ) as Prisma.InputJsonValue,
        justification,
      });
      await this.promote(
        tx,
        copy.bookId,
        now,
        (await this.settings(tx)).holdDays,
      );
      return tx.bookCopy.findUniqueOrThrow({
        where: { id },
        include: { book: true },
      });
    });
  }

  listLoans(query: LoanQuery) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const where: Prisma.LoanWhereInput = {
        memberId: query.memberId,
        status: query.status,
        bookCopy: query.bookId ? { bookId: query.bookId } : undefined,
      };
      return {
        items: await tx.loan.findMany({
          where,
          include: loanInclude,
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          orderBy: [{ borrowedAt: 'desc' }, { id: 'asc' }],
        }),
        total: await tx.loan.count({ where }),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  borrow(dto: LoanDto, actor: string) {
    return this.transaction(async (tx, now) => {
      const settings = await this.eligible(tx, dto.memberId);
      const copy = await tx.bookCopy.findUniqueOrThrow({
        where: { id: dto.bookCopyId },
      });
      const hold = await tx.reservation.findFirst({
        where: { bookCopyId: copy.id, status: 'READY' },
      });
      if (
        copy.status !== 'AVAILABLE' &&
        !(copy.status === 'RESERVED' && hold?.memberId === dto.memberId)
      )
        throw new ConflictException(
          'Exemplar indisponível ou reservado para outro membro',
        );
      const loan = await tx.loan.create({
        data: {
          ...dto,
          borrowedAt: now,
          dueAt: addDays(now, settings.defaultLoanDays),
          createdBy: actor,
          graceDays: settings.graceDays,
          dailyFine: settings.dailyFine,
        },
        include: loanInclude,
      });
      await tx.bookCopy.update({
        where: { id: copy.id },
        data: { status: 'LOANED' },
      });
      if (hold) {
        await tx.reservation.update({
          where: { id: hold.id },
          data: { status: 'FULFILLED' },
        });
        await this.audit(
          tx,
          actor,
          'RESERVATION_FULFILLED',
          'Reservation',
          hold.id,
          { loanId: loan.id },
        );
      }
      await this.audit(tx, actor, 'BORROW', 'Loan', loan.id, {
        bookCopyId: copy.id,
        memberId: dto.memberId,
      });
      await this.audit(tx, actor, 'COPY_LOANED', 'BookCopy', copy.id, {
        loanId: loan.id,
      });
      return loan;
    });
  }

  returnLoan(id: string, actor: string) {
    return this.transaction(async (tx, now) => {
      const loan = await tx.loan.findUniqueOrThrow({
        where: { id },
        include: { bookCopy: true },
      });
      if (!ACTIVE_LOANS.some((status) => status === loan.status))
        throw new ConflictException('Empréstimo já encerrado');
      await tx.loan.update({
        where: { id },
        data: { status: 'RETURNED', returnedAt: now, returnedBy: actor },
      });
      await tx.bookCopy.update({
        where: { id: loan.bookCopyId },
        data: { status: 'AVAILABLE' },
      });
      await this.audit(tx, actor, 'RETURN', 'Loan', id);
      await this.audit(
        tx,
        actor,
        'COPY_RETURNED',
        'BookCopy',
        loan.bookCopyId,
        { loanId: id },
      );
      await this.promote(
        tx,
        loan.bookCopy.bookId,
        now,
        (await this.settings(tx)).holdDays,
      );
      return tx.loan.findUniqueOrThrow({ where: { id }, include: loanInclude });
    });
  }

  renew(id: string, actor: string) {
    return this.transaction(async (tx, now) => {
      const loan = await tx.loan.findUniqueOrThrow({
        where: { id },
        include: { bookCopy: true, member: true },
      });
      const settings = await this.settings(tx);
      if (loan.status !== 'ACTIVE' || loan.member.status !== 'ACTIVE')
        throw new ConflictException(
          'Somente empréstimo ativo sem atraso pode ser renovado',
        );
      if (loan.renewedCount >= settings.maxRenewals)
        throw new ConflictException('Limite de renovações atingido');
      if (
        settings.blockOverdue &&
        (await tx.loan.count({
          where: { memberId: loan.memberId, status: 'OVERDUE' },
        }))
      )
        throw new ConflictException('Membro possui empréstimo em atraso');
      if (
        await tx.reservation.count({
          where: {
            bookId: loan.bookCopy.bookId,
            status: { in: ['WAITING', 'READY'] },
            memberId: { not: loan.memberId },
          },
        })
      )
        throw new ConflictException('Livro possui fila de reservas');
      const dueAt = addDays(
        new Date(Math.max(now.getTime(), loan.dueAt.getTime())),
        settings.defaultLoanDays,
      );
      const result = await tx.loan.update({
        where: { id },
        data: { dueAt, renewedCount: { increment: 1 } },
        include: loanInclude,
      });
      await this.audit(tx, actor, 'RENEW', 'Loan', id, {
        before: loan.dueAt.toISOString(),
        dueAt: dueAt.toISOString(),
      });
      return result;
    });
  }

  closeLoan(id: string, dto: CloseLoanDto, actor: string) {
    return this.transaction(async (tx, now) => {
      const loan = await tx.loan.findUniqueOrThrow({
        where: { id },
        include: { bookCopy: true },
      });
      if (!ACTIVE_LOANS.some((status) => status === loan.status))
        throw new ConflictException('Empréstimo já encerrado');
      await tx.loan.update({
        where: { id },
        data: { status: dto.status, returnedAt: now, returnedBy: actor },
      });
      await tx.bookCopy.update({
        where: { id: loan.bookCopyId },
        data: { status: dto.status === 'LOST' ? 'LOST' : 'AVAILABLE' },
      });
      await this.audit(tx, actor, 'LOAN_CLOSE', 'Loan', id, { ...dto });
      await this.audit(
        tx,
        actor,
        'COPY_LOAN_CLOSED',
        'BookCopy',
        loan.bookCopyId,
        { loanId: id, ...dto },
      );
      await this.promote(
        tx,
        loan.bookCopy.bookId,
        now,
        (await this.settings(tx)).holdDays,
      );
      return tx.loan.findUniqueOrThrow({ where: { id }, include: loanInclude });
    });
  }

  memberHistory(id: string) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      await tx.member.findUniqueOrThrow({ where: { id } });
      return {
        loans: await tx.loan.findMany({
          where: { memberId: id },
          include: {
            ...loanInclude,
            fine: { include: { payments: true, adjustments: true } },
          },
          orderBy: { borrowedAt: 'desc' },
        }),
        reservations: await tx.reservation.findMany({
          where: { memberId: id },
          include: reservationInclude,
          orderBy: { createdAt: 'desc' },
        }),
      };
    });
  }

  members(query: LibraryQuery) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const where: Prisma.MemberWhereInput = query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {};
      return {
        items: await tx.member.findMany({
          where,
          select: { id: true, name: true, status: true },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
        total: await tx.member.count({ where }),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  listReservations(query: LibraryQuery) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const where = { memberId: query.memberId, bookId: query.bookId };
      return {
        items: await tx.reservation.findMany({
          where,
          include: reservationInclude,
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        total: await tx.reservation.count({ where }),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  reserve(dto: ReservationDto, actor: string) {
    return this.transaction(async (tx, now) => {
      const member = await tx.member.findUniqueOrThrow({
        where: { id: dto.memberId },
      });
      if (member.status !== 'ACTIVE')
        throw new ConflictException('Membro inativo');
      await tx.book.findUniqueOrThrow({ where: { id: dto.bookId } });
      if (
        await tx.reservation.count({
          where: { ...dto, status: { in: ['WAITING', 'READY'] } },
        })
      )
        throw new ConflictException(
          'Membro já possui reserva ativa deste livro',
        );
      const settings = await this.settings(tx);
      const reservation = await tx.reservation.create({
        data: {
          ...dto,
          createdBy: actor,
          expiresAt: addDays(now, settings.reservationDays),
        },
      });
      await this.audit(
        tx,
        actor,
        'RESERVATION_CREATE',
        'Reservation',
        reservation.id,
      );
      await this.promote(tx, dto.bookId, now, settings.holdDays);
      return tx.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
        include: reservationInclude,
      });
    });
  }

  cancelReservation(id: string, actor: string) {
    return this.transaction(async (tx, now) => {
      const reservation = await tx.reservation.findUniqueOrThrow({
        where: { id },
      });
      if (!['WAITING', 'READY'].includes(reservation.status))
        throw new ConflictException('Reserva já encerrada');
      await this.releaseReservation(
        tx,
        id,
        reservation.bookCopyId,
        'CANCELLED',
        actor,
      );
      await this.promote(
        tx,
        reservation.bookId,
        now,
        (await this.settings(tx)).holdDays,
      );
      return tx.reservation.findUniqueOrThrow({
        where: { id },
        include: reservationInclude,
      });
    });
  }

  getSettings() {
    return this.transaction((tx) => this.settings(tx));
  }

  updateSettings(dto: SettingsDto, actor: string) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const before = await this.settings(tx);
      const settings = await tx.librarySettings.update({
        where: { id: 1 },
        data: dto,
      });
      await this.audit(tx, actor, 'SETTINGS_UPDATE', 'LibrarySettings', '1', {
        before: JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue,
        after: { ...dto },
      });
      return settings;
    });
  }

  listFines(query: LibraryQuery) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const where: Prisma.FineWhereInput = {
        loan: {
          memberId: query.memberId,
          bookCopy: query.bookId ? { bookId: query.bookId } : undefined,
        },
      };
      return {
        items: await tx.fine.findMany({
          where,
          include: {
            payments: true,
            adjustments: true,
            loan: {
              include: {
                member: { select: { id: true, name: true } },
                bookCopy: { include: { book: true } },
              },
            },
          },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
        total: await tx.fine.count({ where }),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  pay(id: string, dto: PaymentDto, actor: string) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const amount = new Prisma.Decimal(dto.amount);
      const previous = await tx.finePayment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (previous) {
        if (
          previous.fineId !== id ||
          !previous.amount.eq(amount) ||
          previous.createdBy !== actor
        )
          throw new ConflictException(
            'Chave de pagamento reutilizada com dados diferentes',
          );
        return previous;
      }
      const fine = await tx.fine.findUniqueOrThrow({ where: { id } });
      if (
        fine.status !== 'OPEN' ||
        amount.lte(0) ||
        amount.gt(outstanding(fine))
      )
        throw new ConflictException('Pagamento inválido para o saldo pendente');
      const payment = await tx.finePayment.create({
        data: {
          fineId: id,
          amount,
          idempotencyKey: dto.idempotencyKey,
          createdBy: actor,
        },
      });
      await tx.fine.update({
        where: { id },
        data: {
          paidAmount: { increment: amount },
          status: amount.eq(outstanding(fine)) ? 'PAID' : 'OPEN',
        },
      });
      await this.audit(tx, actor, 'FINE_PAYMENT', 'Fine', id, {
        paymentId: payment.id,
        amount: amount.toFixed(2),
        idempotencyKey: dto.idempotencyKey,
      });
      return payment;
    });
  }

  adjust(id: string, dto: AdjustmentDto, actor: string) {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const fine = await tx.fine.findUniqueOrThrow({ where: { id } });
      if (fine.status !== 'OPEN')
        throw new ConflictException('Multa não está pendente');
      const balance = outstanding(fine);
      if (dto.kind !== 'DISCOUNT' && dto.amount !== undefined)
        throw new BadRequestException(
          'Não informe valor para perdão/cancelamento',
        );
      const amount =
        dto.kind === 'DISCOUNT'
          ? new Prisma.Decimal(dto.amount ?? '0')
          : balance;
      if (amount.lte(0) || amount.gt(balance))
        throw new BadRequestException(
          'Desconto deve ser positivo e não exceder o saldo',
        );
      await tx.fineAdjustment.create({
        data: {
          fineId: id,
          kind: dto.kind,
          amount,
          justification: dto.justification.trim(),
          createdBy: actor,
        },
      });
      const result = await tx.fine.update({
        where: { id },
        data: {
          discount: { increment: amount },
          status:
            dto.kind === 'FORGIVE'
              ? 'FORGIVEN'
              : dto.kind === 'CANCEL'
                ? 'CANCELLED'
                : amount.eq(balance)
                  ? 'PAID'
                  : 'OPEN',
        },
        include: { payments: true, adjustments: true },
      });
      await this.audit(tx, actor, 'FINE_ADJUST', 'Fine', id, {
        ...dto,
        amount: amount.toFixed(2),
        beforeBalance: balance.toFixed(2),
      });
      return result;
    });
  }

  dashboard() {
    return this.transaction(async (tx) => {
      await bindAudit(tx);
      const copies = await tx.bookCopy.groupBy({
        by: ['status'],
        _count: true,
      });
      const popular = await tx.loan.groupBy({
        by: ['bookCopyId'],
        where: { status: { not: 'CANCELLED' } },
        _count: true,
      });
      const byBook = new Map<
        string,
        { bookId: string; title: string; count: number }
      >();
      const popularCopies = await tx.bookCopy.findMany({
        where: { id: { in: popular.map((row) => row.bookCopyId) } },
        include: { book: true },
      });
      for (const row of popular) {
        const copy = popularCopies.find((item) => item.id === row.bookCopyId)!;
        const entry = byBook.get(copy.bookId) ?? {
          bookId: copy.bookId,
          title: copy.book.title,
          count: 0,
        };
        entry.count += row._count;
        byBook.set(copy.bookId, entry);
      }
      const fines = await tx.fine.findMany({ where: { status: 'OPEN' } });
      return {
        totalBooks: await tx.book.count(),
        totalCopies: copies.reduce((sum, row) => sum + row._count, 0),
        available:
          copies.find((row) => row.status === 'AVAILABLE')?._count ?? 0,
        loaned: copies.find((row) => row.status === 'LOANED')?._count ?? 0,
        overdue: await tx.loan.count({ where: { status: 'OVERDUE' } }),
        pendingFines: fines
          .reduce(
            (sum, fine) => sum.plus(outstanding(fine)),
            new Prisma.Decimal(0),
          )
          .toFixed(2),
        mostBorrowed: [...byBook.values()]
          .sort((a, b) => b.count - a.count || a.bookId.localeCompare(b.bookId))
          .slice(0, 10),
      };
    });
  }
}
