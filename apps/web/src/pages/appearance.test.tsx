import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';

function deviceTheme(initialDark: boolean) {
  const original = window.matchMedia;
  const listeners = new Set<() => void>();
  const query = {
    matches: initialDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', (media: string) =>
    media === query.media ? query : original(media),
  );
  return (dark: boolean) =>
    act(() => {
      query.matches = dark;
      listeners.forEach((listener) => listener());
    });
}

describe('Account appearance', () => {
  beforeEach(resetTestState);

  it('defaults to the device, saves dark to the account, and restores it on reload', async () => {
    let user = makeUser();
    const requests = mockApi({
      ...sessionRoutes(user),
      'GET /auth/me': () => ({ body: user }),
      'PATCH /auth/preferences': ({ body }) => {
        user = {
          ...user,
          ...(body as { colorMode: 'system' | 'light' | 'dark' }),
        };
        return { body: { colorMode: user.colorMode } };
      },
    });
    const view = renderApp('/account');
    expect(
      await screen.findByRole('radio', { name: 'Seguir o dispositivo' }),
    ).toBeChecked();
    expect(getComputedStyle(document.documentElement).colorScheme).toBe(
      'light',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Escuro' }));
    await screen.findByText('Preferência de aparência salva.');
    expect(screen.getByRole('radio', { name: 'Escuro' })).toBeChecked();
    expect(getComputedStyle(document.documentElement).colorScheme).toBe('dark');
    expect(getComputedStyle(document.body).backgroundColor).toBe(
      'rgb(20, 21, 25)',
    );
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
      colorMode: 'dark',
    });

    view.unmount();
    renderApp('/account');
    expect(await screen.findByRole('radio', { name: 'Escuro' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    await screen.findByText('Preferência de aparência salva.');
    expect(getComputedStyle(document.documentElement).colorScheme).toBe(
      'light',
    );
    expect(user.colorMode).toBe('light');
  });

  it('preserves the current preference when saving fails and allows retry', async () => {
    let fail = true;
    mockApi({
      ...sessionRoutes(makeUser()),
      'PATCH /auth/preferences': () =>
        fail
          ? { status: 503, body: { message: 'Não foi possível salvar.' } }
          : { body: { colorMode: 'dark' } },
    });
    renderApp('/account');
    fireEvent.click(await screen.findByRole('radio', { name: 'Escuro' }));
    await screen.findByText('Não foi possível salvar.');
    expect(
      screen.getByRole('radio', { name: 'Seguir o dispositivo' }),
    ).toBeChecked();
    expect(getComputedStyle(document.documentElement).colorScheme).toBe(
      'light',
    );
    fail = false;
    fireEvent.click(screen.getByRole('radio', { name: 'Escuro' }));
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Escuro' })).toBeChecked(),
    );
  });

  it('returns to the device theme when an account signs out', async () => {
    deviceTheme(true);
    mockApi(sessionRoutes({ ...makeUser(), colorMode: 'light' }));
    renderApp('/account');
    expect(await screen.findByRole('radio', { name: 'Claro' })).toBeChecked();
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrir menu da conta' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: /sair/i }));
    await screen.findByRole('heading', { name: 'Acesse sua conta' });
    expect(getComputedStyle(document.documentElement).colorScheme).toBe('dark');
  });

  it('follows live device changes by default without saving a concrete mode', async () => {
    const setDeviceDark = deviceTheme(true);
    const requests = mockApi(sessionRoutes(makeUser()));
    renderApp('/account');
    expect(
      await screen.findByRole('radio', { name: 'Seguir o dispositivo' }),
    ).toBeChecked();
    expect(getComputedStyle(document.documentElement).colorScheme).toBe('dark');
    setDeviceDark(false);
    expect(getComputedStyle(document.documentElement).colorScheme).toBe(
      'light',
    );
    setDeviceDark(true);
    expect(getComputedStyle(document.documentElement).colorScheme).toBe('dark');
    expect(requests.some((r) => r.method === 'PATCH')).toBe(false);
  });

  it('preserves an explicit choice and lets the user save device-following mode', async () => {
    const setDeviceDark = deviceTheme(true);
    const requests = mockApi({
      ...sessionRoutes({ ...makeUser(), colorMode: 'light' }),
      'PATCH /auth/preferences': { body: { colorMode: 'system' } },
    });
    renderApp('/account');
    expect(await screen.findByRole('radio', { name: 'Claro' })).toBeChecked();
    expect(getComputedStyle(document.documentElement).colorScheme).toBe(
      'light',
    );
    setDeviceDark(false);
    setDeviceDark(true);
    expect(getComputedStyle(document.documentElement).colorScheme).toBe(
      'light',
    );
    fireEvent.click(
      screen.getByRole('radio', { name: 'Seguir o dispositivo' }),
    );
    await screen.findByText('Preferência de aparência salva.');
    expect(getComputedStyle(document.documentElement).colorScheme).toBe('dark');
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
      colorMode: 'system',
    });
    setDeviceDark(false);
    expect(getComputedStyle(document.documentElement).colorScheme).toBe(
      'light',
    );
  });

  it.each([
    ['Aniversariantes do dia', 'pushBirthdays'],
    [
      'Novos pedidos na fila financeira de reembolsos',
      'pushReimbursementRequested',
    ],
    [
      'Pedidos de reembolso de inscrições em eventos',
      'pushEventRefundRequested',
    ],
    ['Empréstimos de livros em atraso', 'pushLibraryOverdue'],
    [
      'Exemplares disponíveis para as minhas reservas',
      'pushLibraryReservationReady',
    ],
  ])('saves the toggle for %s', async (label, key) => {
    const user = {
      ...makeUser(),
      pushReimbursementRequested: true,
      pushEventRefundRequested: true,
      pushLibraryOverdue: true,
      pushLibraryReservationReady: true,
    };
    const requests = mockApi({
      ...sessionRoutes(user),
      'PATCH /auth/preferences': ({ body }) => ({
        body: { ...user, ...(body as Record<string, unknown>) },
      }),
    });
    renderApp('/account');

    const overdue = await screen.findByRole('switch', {
      name: label,
    });
    expect(overdue).toBeChecked();
    fireEvent.click(overdue);
    await screen.findByText('Preferência de notificações salva.');
    expect(overdue).not.toBeChecked();
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
      [key]: false,
    });
  });
});
