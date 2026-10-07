import type { Page } from '@church/shared';
import { apiRequest } from './api';

export type CopyStatus =
  'AVAILABLE' | 'LOANED' | 'RESERVED' | 'MAINTENANCE' | 'LOST' | 'DISPOSED';
export interface BookInput {
  title: string;
  subtitle?: string | null;
  author: string;
  isbn?: string | null;
  publisher?: string | null;
  edition?: string | null;
  year?: number | null;
  language?: string;
  description?: string | null;
  pages?: number | null;
  cover?: string | null;
  category?: string | null;
  keywords?: string[];
}
export interface Book extends BookInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  quantity?: number;
  available?: number;
}
export interface CopyInput {
  assetCode: string;
  barcode?: string | null;
  qrCode?: string | null;
  condition?: string;
  location: string;
  acquiredAt?: string | null;
  notes?: string | null;
}
export interface BookCopy extends CopyInput {
  id: string;
  bookId: string;
  status: CopyStatus;
  book: Book;
  createdAt: string;
  updatedAt: string;
}
export interface Fine {
  id: string;
  loanId: string;
  amount: string;
  paidAmount: string;
  discount: string;
  status: 'OPEN' | 'PAID' | 'FORGIVEN' | 'CANCELLED';
  payments: {
    id: string;
    amount: string;
    createdBy: string;
    createdAt: string;
  }[];
  adjustments: {
    id: string;
    kind: string;
    amount: string;
    justification: string;
    createdBy: string;
    createdAt: string;
  }[];
  loan?: Loan;
}
export interface Loan {
  id: string;
  memberId: string;
  bookCopyId: string;
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  status: 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'LOST' | 'CANCELLED';
  renewedCount: number;
  createdBy: string;
  returnedBy: string | null;
  observations: string | null;
  bookCopy: BookCopy;
  member: { id: string; name: string };
  fine?: Fine | null;
}
export interface Reservation {
  id: string;
  bookId: string;
  memberId: string;
  bookCopyId: string | null;
  status: 'WAITING' | 'READY' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';
  expiresAt: string;
  readyAt: string | null;
  holdUntil: string | null;
  createdAt: string;
  book: Book;
  member: { id: string; name: string };
  bookCopy: BookCopy | null;
}
export interface LibraryHistory {
  loans: Loan[];
  reservations: Reservation[];
}
export interface CopyHistory extends LibraryHistory {
  copy: BookCopy;
  events: {
    id: string;
    action: string;
    actorId: string | null;
    createdAt: string;
    metadata: unknown;
  }[];
}
export interface LibrarySettings {
  defaultLoanDays: number;
  maxBooks: number;
  maxRenewals: number;
  graceDays: number;
  dailyFine: string;
  blockOverdue: boolean;
  holdDays: number;
  reservationDays: number;
}
export interface LibraryDashboard {
  totalBooks: number;
  totalCopies: number;
  available: number;
  loaned: number;
  overdue: number;
  pendingFines: string;
  mostBorrowed: { bookId: string; title: string; count: number }[];
}
export type LibraryFilters = Record<string, string | number | undefined>;
const root = '/library';
export const listBooks = (query: LibraryFilters = {}) =>
  apiRequest<Page<Book>>(`${root}/books`, { query });
export const createBook = (body: BookInput) =>
  apiRequest<Book>(`${root}/books`, { method: 'POST', body });
export const updateBook = (id: string, body: Partial<BookInput>) =>
  apiRequest<Book>(`${root}/books/${id}`, { method: 'PATCH', body });
export const deleteBook = (id: string) =>
  apiRequest<void>(`${root}/books/${id}`, { method: 'DELETE' });
export const listCopies = (query: LibraryFilters = {}) =>
  apiRequest<Page<BookCopy>>(`${root}/copies`, { query });
export const createCopy = (bookId: string, body: CopyInput) =>
  apiRequest<BookCopy>(`${root}/books/${bookId}/copies`, {
    method: 'POST',
    body,
  });
export const updateCopy = (
  id: string,
  body: Partial<CopyInput> & { status?: CopyStatus; justification: string },
) => apiRequest<BookCopy>(`${root}/copies/${id}`, { method: 'PATCH', body });
export const getCopyHistory = (id: string) =>
  apiRequest<CopyHistory>(`${root}/copies/${id}/history`);
export const listLoans = (query: LibraryFilters = {}) =>
  apiRequest<Page<Loan>>(`${root}/loans`, { query });
export const borrow = (body: {
  memberId: string;
  bookCopyId: string;
  observations?: string;
}) => apiRequest<Loan>(`${root}/loans`, { method: 'POST', body });
export const returnLoan = (id: string) =>
  apiRequest<Loan>(`${root}/loans/${id}/return`, { method: 'POST' });
export const renewLoan = (id: string) =>
  apiRequest<Loan>(`${root}/loans/${id}/renew`, { method: 'POST' });
export const closeLoan = (
  id: string,
  body: { status: 'LOST' | 'CANCELLED'; justification: string },
) => apiRequest<Loan>(`${root}/loans/${id}/close`, { method: 'POST', body });
export const getMemberLibraryHistory = (id: string) =>
  apiRequest<LibraryHistory>(`${root}/members/${id}/history`);
export const listLibraryMembers = (query: LibraryFilters = {}) =>
  apiRequest<Page<{ id: string; name: string; status: string }>>(
    `${root}/members`,
    { query },
  );
export const listReservations = (query: LibraryFilters = {}) =>
  apiRequest<Page<Reservation>>(`${root}/reservations`, { query });
export const reserve = (body: { memberId: string; bookId: string }) =>
  apiRequest<Reservation>(`${root}/reservations`, { method: 'POST', body });
export const cancelReservation = (id: string) =>
  apiRequest<Reservation>(`${root}/reservations/${id}/cancel`, {
    method: 'POST',
  });
export const listFines = (query: LibraryFilters = {}) =>
  apiRequest<Page<Fine>>(`${root}/fines`, { query });
export const payFine = (
  id: string,
  body: { amount: string; idempotencyKey: string },
) =>
  apiRequest<Fine['payments'][number]>(`${root}/fines/${id}/payments`, {
    method: 'POST',
    body,
  });
export const adjustFine = (
  id: string,
  body: {
    kind: 'DISCOUNT' | 'FORGIVE' | 'CANCEL';
    amount?: string;
    justification: string;
  },
) =>
  apiRequest<Fine>(`${root}/fines/${id}/adjustments`, { method: 'POST', body });
export const getLibrarySettings = () =>
  apiRequest<LibrarySettings>(`${root}/settings`);
export const updateLibrarySettings = (body: LibrarySettings) =>
  apiRequest<LibrarySettings>(`${root}/settings`, { method: 'PATCH', body });
export const getLibraryDashboard = () =>
  apiRequest<LibraryDashboard>(`${root}/dashboard`);

/** Presentation arithmetic in cents, never binary floating point. */
export function fineBalance(
  fine: Pick<Fine, 'amount' | 'paidAmount' | 'discount'>,
): string {
  const cents = (value: string) => {
    const [whole = '0', fraction = ''] = value.split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  };
  const value =
    cents(fine.amount) - cents(fine.paidAmount) - cents(fine.discount);
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}
