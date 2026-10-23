import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MEMBER_PERMISSIONS } from '@church/shared';
import {
  anonymousRoutes,
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
import { canAccessRoute } from './route-access';

describe('Direct route authorization', () => {
  beforeEach(resetTestState);

  it.each([
    '/members',
    '/members/new',
    '/members/m1',
    '/members/m1/edit',
    '/users',
    '/operations',
    '/my-events',
    '/my-events?event=e1&section=payments',
    '/my-events?create=true',
    '/events',
    '/events?view=community',
    '/visitors',
    '/follow-ups',
    '/small-groups',
    '/small-groups?view=community',
    '/ministries',
    '/ministries?view=community',
    '/schedules',
    '/notifications',
    '/notification-templates',
    '/library',
    '/finance',
    '/audit',
    '/unknown-module',
  ])(
    'denies %s before mounting the page or requesting its data',
    async (url) => {
      const requests = mockApi(sessionRoutes(makeUser([])));
      renderApp(url);

      expect(
        await screen.findByRole('heading', { name: 'Acesso negado' }),
      ).toBeInTheDocument();
      expect(
        requests
          .filter((r) =>
            /^\/(members|events|member-portal|library|finance|audit|operations)(\/|$)/.test(
              r.path,
            ),
          )
          .filter(
            (r) =>
              ![
                '/operations/inbox/unread',
                '/operations/push/config',
                '/operations/push/subscription',
              ].includes(r.path),
          ),
      ).toEqual([]);
    },
  );

  it('requires login before evaluating route permissions', async () => {
    mockApi(anonymousRoutes);
    renderApp('/my-events?event=e1');
    expect(
      await screen.findByRole('button', { name: 'Entrar' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Acesso negado' }),
    ).not.toBeInTheDocument();
  });

  it('keeps personal routes and the community portal available to members', () => {
    for (const url of [
      '/',
      '/account',
      '/inbox',
      '/reimbursements',
      '/pedir-reembolso',
    ]) {
      expect(canAccessRoute(url, [])).toBe(true);
    }
    for (const url of [
      '/events',
      '/small-groups?view=community',
      '/ministries',
      '/schedules',
      '/library',
    ]) {
      expect(canAccessRoute(url, MEMBER_PERMISSIONS)).toBe(true);
    }
    expect(canAccessRoute('/my-events', MEMBER_PERMISSIONS)).toBe(false);
  });

  it('requires the specific member action and all audit permissions', () => {
    expect(canAccessRoute('/members/new', ['MEMBER_READ'])).toBe(false);
    expect(canAccessRoute('/members/m1/edit', ['MEMBER_READ'])).toBe(false);
    expect(canAccessRoute('/members/new', ['MEMBER_CREATE'])).toBe(true);
    expect(canAccessRoute('/members/m1/edit', ['MEMBER_UPDATE'])).toBe(true);
    expect(canAccessRoute('/audit', ['AUDIT_READ'])).toBe(false);
    expect(canAccessRoute('/schedules', ['SCHEDULE_READ'])).toBe(true);
  });
});
