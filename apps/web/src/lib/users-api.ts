import { apiRequest } from './api';
import type { Paginated, User, UserStatus } from './types';

export interface UserRole {
  id: string;
  name: string;
}

export interface AvailableRole extends UserRole {
  assignable: boolean;
}

export function listRoles(): Promise<AvailableRole[]> {
  return apiRequest('/users/roles');
}

export function getUserRoles(id: string): Promise<UserRole[]> {
  return apiRequest(`/users/${encodeURIComponent(id)}/roles`);
}

export function updateUserRoles(
  id: string,
  roleIds: string[],
): Promise<{ id: string; roles: UserRole[] }> {
  return apiRequest(`/users/${encodeURIComponent(id)}/roles`, {
    method: 'PATCH',
    body: { roleIds },
  });
}

export function listUsers(params: {
  page: number;
  pageSize: number;
}): Promise<Paginated<User>> {
  return apiRequest<Paginated<User>>('/users', { query: { ...params } });
}

export function createUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  return apiRequest<User>('/users', { method: 'POST', body: input });
}

export function updateUserStatus(
  id: string,
  status: UserStatus,
): Promise<User> {
  return apiRequest<User>(`/users/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: { status },
  });
}
