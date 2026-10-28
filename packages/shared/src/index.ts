/** JSON values on the wire; dates in response contracts are ISO strings. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface FrontendErrorDevice {
  appVersion?: string;
  network?: FrontendErrorNetwork;
  [key: string]: JsonValue | FrontendErrorNetwork | undefined;
}
export interface FrontendErrorNetwork {
  ipAddress?: string;
  geo?: { country?: string; region?: string; city?: string };
}
export interface FrontendErrorSummary {
  id: string;
  occurredAt: string;
  createdAt: string;
  eventType: string;
  message: string;
  route: string;
  userId: string | null;
  user: { id: string; name: string; memberId: string | null } | null;
  apiStatus: number | null;
  device: FrontendErrorDevice | null;
}
export interface FrontendErrorDetail extends FrontendErrorSummary {
  requestId: string;
  clientRequestId: string | null;
  stack: string | null;
  apiPath: string | null;
  apiMethod: string | null;
  userAgent: string | null;
  logs: JsonValue;
}
export interface FrontendErrorStat {
  kind: string;
  label: string;
  count: number;
}
export interface FrontendErrorStats {
  rows: FrontendErrorStat[];
}

export interface BookAvailability {
  bookId: string;
  quantity: number;
  available: number;
}

export const PERMISSIONS = [
  'COMMUNITY_READ',
  'FINANCE_SUMMARY_READ',
  'LIBRARY_SELF_RESERVE',
  'OPERATION_SCOPE_ALL',
  'VISITOR_CREATE',
  'VISITOR_UPDATE',
  'FOLLOWUP_READ',
  'FOLLOWUP_CREATE',
  'FOLLOWUP_UPDATE',
  'SMALL_GROUP_READ',
  'SMALL_GROUP_MANAGE',
  'MINISTRY_READ',
  'MINISTRY_MANAGE',
  'EVENT_MANAGE',
  'EVENT_CREATE',
  'EVENT_UPDATE',
  'EVENT_PUBLISH',
  'EVENT_REGISTRATION_READ',
  'EVENT_REGISTRATION_MANAGE',
  'EVENT_REGISTRATION_APPROVE',
  'EVENT_ATTENDEE_READ',
  'EVENT_ATTENDEE_MANAGE',
  'EVENT_TICKET_MANAGE',
  'EVENT_COUPON_MANAGE',
  'EVENT_PAYMENT_READ',
  'EVENT_CHECKIN',
  'EVENT_CHECKIN_REVERSE',
  'EVENT_NOTIFICATION_SEND',
  'EVENT_REPORT_READ',
  'EVENT_REPORT_EXPORT',
  'EVENT_REFUND_APPROVE',
  'EVENT_MANAGER_ASSIGN',
  'SCHEDULE_READ',
  'SCHEDULE_MANAGE',
  'NOTIFICATION_READ',
  'NOTIFICATION_SEND',
  'VISITOR_READ',
  'VISITOR_WRITE',
  'EVENT_READ',
  'EVENT_WRITE',
  'AUDIT_READ',
  'PERMISSION_MANAGE',
  'PRIVACY_EXPORT',
  'PRIVACY_MANAGE',
  'USER_READ',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DELETE',
  'MEMBER_READ',
  'MEMBER_CREATE',
  'MEMBER_UPDATE',
  'MEMBER_DELETE',
  'LIBRARY_BOOK_READ',
  'LIBRARY_BOOK_CREATE',
  'LIBRARY_BOOK_UPDATE',
  'LIBRARY_BOOK_DELETE',
  'LIBRARY_LOAN_CREATE',
  'LIBRARY_LOAN_RETURN',
  'LIBRARY_LOAN_RENEW',
  'LIBRARY_LOAN_READ',
  'LIBRARY_HISTORY_READ',
  'LIBRARY_COPY_READ',
  'LIBRARY_COPY_CREATE',
  'LIBRARY_COPY_UPDATE',
  'LIBRARY_RESERVATION_READ',
  'LIBRARY_RESERVATION_CREATE',
  'LIBRARY_RESERVATION_CANCEL',
  'LIBRARY_FINE_READ',
  'LIBRARY_FINE_PAY',
  'LIBRARY_FINE_ADJUST',
  'LIBRARY_SETTINGS_READ',
  'LIBRARY_SETTINGS_UPDATE',
  'LIBRARY_DASHBOARD_READ',
  'FINANCE_TRANSACTION_READ',
  'FINANCE_TRANSACTION_CREATE',
  'FINANCE_TRANSACTION_UPDATE',
  'FINANCE_CATEGORY_READ',
  'FINANCE_CATEGORY_WRITE',
  'FINANCE_ACCOUNT_READ',
  'FINANCE_ACCOUNT_WRITE',
  'FINANCE_SUPPLIER_READ',
  'FINANCE_SUPPLIER_WRITE',
  'FINANCE_CONTRIBUTION_WRITE',
  'FINANCE_ATTACHMENT_READ',
  'FINANCE_ATTACHMENT_WRITE',
  'FINANCE_DASHBOARD_READ',
  'FINANCE_BANK_IMPORT',
  'FINANCE_INVOICE_READ',
  'FINANCE_INVOICE_IMPORT',
  'FINANCE_INVOICE_ASSOCIATE',
  'FINANCE_RECONCILE',
  'FINANCE_CONTRIBUTION_READ',
  'FINANCE_CONTRIBUTION_EXPORT',
] as const;

export const MEMBER_PERMISSIONS = [
  'COMMUNITY_READ',
  'FINANCE_SUMMARY_READ',
  'LIBRARY_BOOK_READ',
  'LIBRARY_SELF_RESERVE',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const INITIAL_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'LEADER',
  'FINANCE',
  'LIBRARY',
  'SECRETARY',
  'MEMBER',
  'EVENT_MANAGER',
] as const;

export type InitialRole = (typeof INITIAL_ROLES)[number];

const OPERATIONAL_PERMISSIONS = PERMISSIONS.filter(
  (code) =>
    [
      'VISITOR_',
      'FOLLOWUP_',
      'SMALL_GROUP_',
      'MINISTRY_',
      'EVENT_',
      'SCHEDULE_',
      'NOTIFICATION_',
    ].some((prefix) => code.startsWith(prefix)) &&
    (!code.startsWith('EVENT_') ||
      ['EVENT_READ', 'EVENT_MANAGE'].includes(code)) &&
    ![
      'VISITOR_WRITE',
      'EVENT_WRITE',
      'EVENT_MANAGER_ASSIGN',
      'EVENT_REFUND_APPROVE',
    ].includes(code),
);

export const ROLE_PERMISSIONS: Record<InitialRole, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  ADMIN: PERMISSIONS.filter(
    (code) =>
      code === 'PERMISSION_MANAGE' ||
      code.startsWith('USER_') ||
      code.startsWith('MEMBER_') ||
      code.startsWith('VISITOR_') ||
      code.startsWith('EVENT_') ||
      [
        'OPERATION_',
        'FOLLOWUP_',
        'SMALL_GROUP_',
        'MINISTRY_',
        'SCHEDULE_',
        'NOTIFICATION_',
      ].some((prefix) => code.startsWith(prefix)) ||
      (code.startsWith('LIBRARY_') && code.endsWith('_READ')) ||
      [
        'FINANCE_TRANSACTION_READ',
        'FINANCE_CATEGORY_READ',
        'FINANCE_ACCOUNT_READ',
        'FINANCE_SUPPLIER_READ',
        'FINANCE_DASHBOARD_READ',
      ].includes(code),
  ),
  SECRETARY: ['MEMBER_READ', 'MEMBER_CREATE', 'MEMBER_UPDATE'],
  PASTOR: ['MEMBER_READ', 'OPERATION_SCOPE_ALL', ...OPERATIONAL_PERMISSIONS],
  LEADER: OPERATIONAL_PERMISSIONS,
  FINANCE: PERMISSIONS.filter((code) => code.startsWith('FINANCE_')),
  LIBRARY: PERMISSIONS.filter((code) => code.startsWith('LIBRARY_')),
  MEMBER: [],
  EVENT_MANAGER: [
    'EVENT_READ',
    'EVENT_CREATE',
    'EVENT_UPDATE',
    'EVENT_PUBLISH',
    'EVENT_REGISTRATION_READ',
    'EVENT_REGISTRATION_MANAGE',
    'EVENT_REGISTRATION_APPROVE',
    'EVENT_ATTENDEE_READ',
    'EVENT_ATTENDEE_MANAGE',
    'EVENT_TICKET_MANAGE',
    'EVENT_COUPON_MANAGE',
    'EVENT_PAYMENT_READ',
    'EVENT_CHECKIN',
    'EVENT_CHECKIN_REVERSE',
    'EVENT_NOTIFICATION_SEND',
    'EVENT_REPORT_READ',
    'EVENT_REPORT_EXPORT',
  ],
};

export interface CurrentUser {
  pushReimbursementRequested?: boolean;
  colorMode?: 'system' | 'light' | 'dark';
  pushEventRefundRequested?: boolean;
  pushLibraryOverdue?: boolean;
  pushLibraryReservationReady?: boolean;
  pushBirthdays?: boolean;
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED' | 'PENDING_APPROVAL';
  memberId?: string | null;
  roles?: string[];
  permissions: Permission[];
}

export interface AuthResponse {
  accessToken: string;
  user: CurrentUser;
}

export interface Member {
  user?: {
    id: string;
    name: string;
    email: string;
    status: CurrentUser['status'];
  } | null;
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  iban?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  birthDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Approval is restricted to the church's administrators and pastors. */
export function canApproveRegistrations(
  user: Pick<CurrentUser, 'roles' | 'status'> | null | undefined,
): boolean {
  return (
    user?.status === 'ACTIVE' &&
    (user.roles?.some((role) =>
      ['SUPER_ADMIN', 'ADMIN', 'PASTOR'].includes(role),
    ) ??
      false)
  );
}
export { videoPlaylists } from './video-playlists';
export type PlaylistVideo = {
  id: string;
  title: string;
  thumbnailUrl: string;
  position: number;
};
export type PlaylistVideoPage = {
  items: PlaylistVideo[];
  nextPageToken?: string;
};
export type PlaylistVideoFeed = PlaylistVideoPage & {
  updatedAt: string;
  stale: boolean;
};

export { HTTP_CACHE_ROUTES, responseCacheTtl } from './http-cache-policy';
