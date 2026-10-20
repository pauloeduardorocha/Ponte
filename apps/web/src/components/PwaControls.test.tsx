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

const sw = vi.hoisted(() => ({
  refresh: false,
  update: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.refresh, sw.dismiss],
    updateServiceWorker: sw.update,
  }),
}));

beforeEach(() => {
  sw.refresh = false;
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
    sw.update.mockClear();
    render(<PwaControls />);
    expect(sw.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(sw.update).toHaveBeenCalledWith(true);
  });
});
