import { matchPath } from 'react-router-dom';
import { AUDIT_PERMISSIONS } from '../lib/audit-permissions';
import type { Permission } from '../lib/types';

type AccessRule = {
  path: string;
  any?: readonly Permission[];
  all?: readonly Permission[];
  prefix?: 'LIBRARY_' | 'FINANCE_';
};

// Keep navigation visibility and direct URL access on the same policy.
const routeAccess: readonly AccessRule[] = [
  { path: '/' },
  { path: '/account' },
  { path: '/inbox' },
  { path: '/videos' },
  { path: '/videos/:playlistId' },
  { path: '/reimbursements' },
  { path: '/pedir-reembolso' },
  { path: '/my-events', all: ['EVENT_READ'] },
  {
    path: '/operations',
    any: [
      'MEMBER_READ',
      'VISITOR_READ',
      'FOLLOWUP_READ',
      'SMALL_GROUP_READ',
      'MINISTRY_READ',
      'EVENT_READ',
      'SCHEDULE_READ',
    ],
  },
  { path: '/audit', all: AUDIT_PERMISSIONS },
  { path: '/members', all: ['MEMBER_READ'] },
  { path: '/members/new', all: ['MEMBER_CREATE'] },
  { path: '/members/:id/edit', all: ['MEMBER_UPDATE'] },
  { path: '/members/:id', all: ['MEMBER_READ'] },
  { path: '/users', all: ['MEMBER_READ'] },
  { path: '/events', any: ['EVENT_READ', 'COMMUNITY_READ'] },
  { path: '/visitors', all: ['VISITOR_READ'] },
  { path: '/follow-ups', all: ['FOLLOWUP_READ'] },
  { path: '/small-groups', any: ['SMALL_GROUP_READ', 'COMMUNITY_READ'] },
  { path: '/ministries', any: ['MINISTRY_READ', 'COMMUNITY_READ'] },
  { path: '/schedules', any: ['SCHEDULE_READ', 'COMMUNITY_READ'] },
  { path: '/notifications', all: ['NOTIFICATION_READ'] },
  { path: '/notification-templates', all: ['NOTIFICATION_READ'] },
  { path: '/library', prefix: 'LIBRARY_' },
  { path: '/finance', prefix: 'FINANCE_' },
];

export function canAccessRoute(
  url: string,
  permissions: readonly Permission[],
): boolean {
  const pathname = url.split(/[?#]/)[0] ?? '';
  const rule = routeAccess.find(({ path }) => matchPath(path, pathname));
  if (!rule) return false;
  const prefix = rule.prefix;
  return (
    (!rule.all || rule.all.every((p) => permissions.includes(p))) &&
    (!rule.any || rule.any.some((p) => permissions.includes(p))) &&
    (!prefix || permissions.some((p) => p.startsWith(prefix)))
  );
}
