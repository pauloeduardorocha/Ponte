import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyPwaUpdate } from './pwa-update';

class Worker extends EventTarget {
  state: ServiceWorkerState = 'installed';
  postMessage = vi.fn();
  change(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

function register(waiting: Worker | null, installing: Worker | null = null) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue({ waiting, installing }),
    },
  });
}

afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  vi.useRealTimers();
});

describe('User-confirmed PWA update', () => {
  it('checks the registration on explicit acceptance before activating the new worker', async () => {
    const worker = new Worker();
    const registration = {
      waiting: null as Worker | null,
      installing: null,
      update: vi.fn(),
    };
    registration.update.mockImplementation(async () => {
      registration.waiting = worker;
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(registration) },
    });
    const reload = vi.fn();
    const result = applyPwaUpdate(reload, true);
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce());
    expect(registration.update).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
    worker.change('activated');
    await result;
    expect(reload).toHaveBeenCalledOnce();
  });
  it('reloads only after the waiting worker is activated, even without a controlling event', async () => {
    const worker = new Worker();
    register(worker);
    const reload = vi.fn();
    const update = applyPwaUpdate(reload);
    await vi.waitFor(() =>
      expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }),
    );
    expect(reload).not.toHaveBeenCalled();
    worker.change('activating');
    expect(reload).not.toHaveBeenCalled();
    worker.change('activated');
    await update;
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads a stale banner when another tab already activated the update', async () => {
    register(null);
    const reload = vi.fn();
    await applyPwaUpdate(reload);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('waits for an in-progress installation before requesting activation', async () => {
    const worker = new Worker();
    worker.state = 'installing';
    register(null, worker);
    const reload = vi.fn();
    const update = applyPwaUpdate(reload);
    await Promise.resolve();
    expect(worker.postMessage).not.toHaveBeenCalled();
    worker.change('installed');
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce());
    worker.change('activated');
    await update;
    expect(reload).toHaveBeenCalledOnce();
  });

  it('rejects an interrupted worker without reloading', async () => {
    const worker = new Worker();
    register(worker);
    const reload = vi.fn();
    const update = applyPwaUpdate(reload);
    const rejected = expect(update).rejects.toThrow('interrompida');
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce());
    worker.change('redundant');
    await rejected;
    expect(reload).not.toHaveBeenCalled();
  });

  it('times out without repeatedly refreshing the old version', async () => {
    vi.useFakeTimers();
    const worker = new Worker();
    register(worker);
    const reload = vi.fn();
    const update = applyPwaUpdate(reload);
    const rejected = expect(update).rejects.toThrow('demorou');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(reload).not.toHaveBeenCalled();
  });

  it('surfaces registration failures so the banner can offer retry', async () => {
    register(null);
    vi.mocked(navigator.serviceWorker.getRegistration).mockRejectedValue(
      new Error('Offline'),
    );
    const reload = vi.fn();
    await expect(applyPwaUpdate(reload)).rejects.toThrow('Offline');
    expect(reload).not.toHaveBeenCalled();
  });
});
