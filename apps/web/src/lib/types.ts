import type {
  AuthResponse,
  CurrentUser,
  Member,
  Page,
  Permission,
} from '@church/shared';

export type { CurrentUser, Member, Permission };

export type Paginated<T> = Page<T>;

export type UserStatus = CurrentUser['status'];

export type User = Omit<CurrentUser, 'permissions'>;

export type AuthSession = AuthResponse;

export type MemberStatus = 'ACTIVE' | 'INACTIVE';

export type MemberSortBy = 'name' | 'email' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export interface MemberListParams {
  search?: string;
  status?: MemberStatus;
  page: number;
  pageSize: number;
  sortBy: MemberSortBy;
  sortOrder: SortOrder;
}

export interface MemberInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  status?: MemberStatus;
  birthDate?: string | null;
  notes?: string | null;
}
