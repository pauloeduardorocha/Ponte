import { apiRequest } from './api';
import type { Paginated, User, UserStatus } from './types';

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
