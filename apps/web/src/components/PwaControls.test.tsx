import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaControls } from './PwaControls';
import { applyPwaUpdate } from '../lib/pwa-update';

const sw = vi.hoisted(() => ({
  refresh: false,
  dismiss: vi.fn(),
  version: null as string | null,
}));
vi.mock('../lib/app-update', () => ({
  getAvailableVersion: () => sw.version,
  subscribeToAppUpdate: () => () => {},
  UPDATE_MESSAGE:
    'Há uma atualização disponível. Guarde as alterações e atualize para continuar.',
}));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.refresh, sw.dismiss],
  }),
}));
vi.mock('../lib/pwa-update', () => ({ applyPwaUpdate: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  sw.refresh = false;
  sw.version = null;
  vi.mocked(applyPwaUpdate).mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PWA installation and updates', () => {
  it('offers a version discovered after an error even without a waiting worker', () => {
    sw.version = '99.0.0';
    render(<PwaControls />);
    expect(
      screen.getByText(/Há uma atualização disponível/),
    ).toBeInTheDocument();
    expect(applyPwaUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(applyPwaUpdate).toHaveBeenCalledWith(undefined, true);
  });
  it('remembers dismissal of the iOS installation instructions', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    const view = render(<PwaControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Instalar aplicação' }));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Já instalei / Não mostrar novamente',
      }),
    );
    view.unmount();
    render(<PwaControls />);
    expect(
      screen.queryByRole('button', { name: 'Instalar aplicação' }),
    ).not.toBeInTheDocument();
  });

  it('hides installation when the browser detects this installed PWA', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    const getInstalledRelatedApps = vi
      .fn()
      .mockResolvedValue([
        {
          platform: 'webapp',
          url: new URL('/manifest.webmanifest', window.location.origin).href,
        },
      ]);
    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      configurable: true,
      value: getInstalledRelatedApps,
    });
    try {
      render(<PwaControls />);
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: 'Instalar aplicação' }),
        ).not.toBeInTheDocument(),
      );
    } finally {
      Reflect.deleteProperty(navigator, 'getInstalledRelatedApps');
    }
  });

  it('preserves manual installation if related-app detection fails', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    const getInstalledRelatedApps = vi
      .fn()
      .mockRejectedValue(new Error('Unavailable'));
    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      configurable: true,
      value: getInstalledRelatedApps,
    });
    try {
      render(<PwaControls />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(
        screen.getByRole('button', { name: 'Instalar aplicação' }),
      ).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(navigator, 'getInstalledRelatedApps');
    }
  });

  it('opens the Android install prompt and hides the button after acceptance', async () => {
    render(<PwaControls />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(
      new Event('beforeinstallprompt', { cancelable: true }),
      {
        prompt,
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      },
    );
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Instalar aplicação' }));
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Instalar aplicação' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('explains installation on iOS and hides installation in standalone mode', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    const view = render(<PwaControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Instalar aplicação' }));
    expect(screen.getByText(/Abra esta página no Safari/)).toBeInTheDocument();
    view.unmount();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    render(<PwaControls />);
    expect(
      screen.queryByRole('button', { name: 'Instalar aplicação' }),
    ).not.toBeInTheDocument();
  });

  it('waits for user confirmation before applying an update', () => {
    sw.refresh = true;
    render(<PwaControls />);
    expect(applyPwaUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(applyPwaUpdate).toHaveBeenCalledOnce();
  });

  it('shows progress and prevents duplicate update requests', async () => {
    sw.refresh = true;
    let finish!: () => void;
    vi.mocked(applyPwaUpdate).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<PwaControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(screen.getByRole('button', { name: 'A atualizar…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'A atualizar…' }));
    expect(applyPwaUpdate).toHaveBeenCalledOnce();
    await act(async () => finish());
  });

  it('reports update errors and lets the user retry', async () => {
    sw.refresh = true;
    vi.mocked(applyPwaUpdate).mockRejectedValueOnce(
      new Error('A atualização foi interrompida. Tente novamente.'),
    );
    render(<PwaControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(
      await screen.findByText(
        'A atualização foi interrompida. Tente novamente.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(applyPwaUpdate).toHaveBeenCalledTimes(2));
  });
});
