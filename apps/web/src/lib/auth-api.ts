import { apiRequest, setAccessToken } from './api';
import type { AuthSession, CurrentUser, User } from './types';

export interface MessageResponse {
  message?: string;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuthRefresh: true,
  });
  setAccessToken(session.accessToken);
  return session;
}

export function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  return apiRequest<User>('/auth/register', {
    method: 'POST',
    body: input,
    skipAuthRefresh: true,
  });
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/auth/me');
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<void>('/auth/logout', {
      method: 'POST',
      skipAuthRefresh: true,
    });
  } finally {
    setAccessToken(null);
  }
}

export function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<MessageResponse | undefined> {
  return apiRequest('/auth/password', { method: 'PATCH', body: input });
}

export function forgotPassword(
  email: string,
): Promise<MessageResponse | undefined> {
  return apiRequest('/auth/forgot-password', {
    method: 'POST',
    body: { email },
    skipAuthRefresh: true,
  });
}

export function resetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<MessageResponse | undefined> {
  return apiRequest('/auth/reset-password', {
    method: 'POST',
    body: input,
    skipAuthRefresh: true,
  });
}
