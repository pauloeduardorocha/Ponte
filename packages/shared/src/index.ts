export const PERMISSIONS = [
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
  'SCHEDULE_READ',
  'SCHEDULE_MANAGE',
  'ATTENDANCE_READ',
  'ATTENDANCE_MANAGE',
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
      'ATTENDANCE_',
      'NOTIFICATION_',
    ].some((prefix) => code.startsWith(prefix)) &&
    !['VISITOR_WRITE', 'EVENT_WRITE'].includes(code),
);

export const ROLE_PERMISSIONS: Record<InitialRole, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  ADMIN: PERMISSIONS.filter(
    (code) =>
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
        'ATTENDANCE_',
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
};

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  permissions: Permission[];
}

export interface AuthResponse {
  accessToken: string;
  user: CurrentUser;
}

export interface Member {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
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
