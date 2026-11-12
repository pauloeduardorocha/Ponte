import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOCALE,
  getLocale,
  LOCALE_STORAGE_KEY,
  setLocale,
  t,
} from './index';
import ptPT from './pt-PT.json';
import ptBR from './pt-BR.json';
import en from './en.json';
import { emailSchema, passwordSchema } from '../lib/validation';
import { formatDate, formatDateTime } from '../lib/format';
import { money as formatMoney } from '../pages/reimbursements/api';
import {
  anonymousRoutes,
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';

beforeEach(() => {
  resetTestState();
  localStorage.clear();
  setLocale(DEFAULT_LOCALE);
  localStorage.clear();
});
afterEach(() => {
  resetTestState();
  setLocale(DEFAULT_LOCALE);
  localStorage.clear();
});

function choose(name: string, language: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name }));
  fireEvent.click(screen.getByRole('option', { name: language }));
}

describe('Application language', () => {
  it('defaults to Portugal and switches all login labels without losing typed data', async () => {
    mockApi(anonymousRoutes);
    renderApp('/login');
    expect(
      await screen.findByRole('heading', { name: 'Aceda à sua conta' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'name@example.org' },
    });
    fireEvent.change(screen.getByLabelText('Palavra-passe'), {
      target: { value: 'draft-password' },
    });
    choose('Idioma', 'English');
    expect(
      screen.getByRole('heading', { name: 'Access your account' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('name@example.org');
    expect(screen.getByLabelText('Password')).toHaveValue('draft-password');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    choose('Language', 'Português (Brasil)');
    expect(
      screen.getByRole('heading', { name: 'Acesse sua conta' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toHaveValue('draft-password');
    expect(document.documentElement.lang).toBe('pt-BR');
    choose('Idioma', 'Português (Portugal)');
    expect(screen.getByLabelText('Palavra-passe')).toHaveValue(
      'draft-password',
    );
  });

  it('places the selector beside the avatar and keeps names and permissions intact', async () => {
    const user = { ...makeUser(), name: 'Minha conta' };
    const requests = mockApi(sessionRoutes(user));
    renderApp('/account');
    const avatar = await screen.findByRole('button', {
      name: 'Abrir menu da conta',
    });
    expect(avatar.previousElementSibling).toContainElement(
      screen.getByRole('combobox', { name: 'Idioma' }),
    );
    choose('Idioma', 'English');
    expect(
      await screen.findByRole('button', { name: 'Open account menu' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Language' }).querySelector('img'),
    ).toHaveAttribute('src', '/flags/gb.svg');
    fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
    expect(
      within(screen.getByRole('menu')).getByText('Minha conta'),
    ).toBeInTheDocument();
    expect(
      requests.some(
        (request) =>
          request.method === 'PATCH' ||
          (request.method === 'POST' && request.path !== '/auth/refresh'),
      ),
    ).toBe(false);
    expect(user.permissions).toEqual([]);
  });

  it('validates using the current language even for schemas created before switching', () => {
    setLocale('en');
    expect(emailSchema.safeParse('bad').error?.issues[0]?.message).toBe(
      'Enter a valid email.',
    );
    expect(passwordSchema.safeParse('short').error?.issues[0]?.message).toBe(
      'The password must be at least 12 characters long.',
    );
    setLocale('pt-PT');
    expect(
      passwordSchema.safeParse('short').error?.issues[0]?.message,
    ).toContain('palavra-passe');
    expect(t('Responder a {0}', ['Minha conta'])).toBe(
      'Responder a Minha conta',
    );
  });

  it('formats dates and currency on demand after language changes', () => {
    const pt = formatMoney('1234.50', 'EUR');
    setLocale('en');
    expect(formatMoney('1234.50', 'EUR')).not.toBe(pt);
    expect(formatDate('2026-11-12T12:30:00')).toBe('12/11/2026');
    expect(formatDateTime('2026-11-12T12:30:00')).toContain('12/11/2026');
  });

  it('synchronizes another tab and survives unavailable local storage', async () => {
    mockApi(anonymousRoutes);
    renderApp('/login');
    await screen.findByRole('combobox', { name: 'Idioma' });
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: LOCALE_STORAGE_KEY }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Language' }),
      ).toBeInTheDocument(),
    );
    const blocked = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    vi.stubGlobal('caches', {
      open: () => {
        throw new Error('blocked');
      },
    });
    act(() => setLocale('pt-BR'));
    expect(getLocale()).toBe('pt-BR');
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    blocked.mockRestore();
  });

  it('keeps complete catalogs and all interpolation placeholders in every language', () => {
    for (const catalog of [ptBR, en]) {
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(ptPT).sort());
      for (const [source, value] of Object.entries(catalog)) {
        expect(value.trim(), source).not.toBe('');
        const placeholders = (text: string) =>
          text.match(/\{\d+\}/g)?.sort() ?? [];
        expect(placeholders(value), source).toEqual(placeholders(source));
      }
    }
  });
});
