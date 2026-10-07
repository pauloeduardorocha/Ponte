import { apiRequest } from './api';
import type { Member, MemberInput, MemberListParams, Paginated } from './types';

export function listMembers(
  params: MemberListParams,
): Promise<Paginated<Member>> {
  return apiRequest<Paginated<Member>>('/members', { query: { ...params } });
}

export function getMember(id: string): Promise<Member> {
  return apiRequest<Member>(`/members/${encodeURIComponent(id)}`);
}

export function createMember(input: MemberInput): Promise<Member> {
  return apiRequest<Member>('/members', { method: 'POST', body: input });
}

export function updateMember(id: string, input: MemberInput): Promise<Member> {
  return apiRequest<Member>(`/members/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteMember(id: string): Promise<void> {
  return apiRequest<void>(`/members/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
