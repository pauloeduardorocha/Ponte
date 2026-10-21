import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

describe('Push service worker', () => {
  function setup() {
    const handlers: Record<string, (event: unknown) => void> = {};
    const client = {
      url: 'https://ponte.example/account',
      navigate: jest.fn(),
      focus: jest.fn(),
      postMessage: jest.fn(),
    };
    const worker = {
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        handlers[type] = fn;
      },
      location: { origin: 'https://ponte.example' },
      registration: { showNotification: jest.fn() },
      clients: {
        matchAll: jest.fn().mockResolvedValue([client]),
        openWindow: jest.fn(),
      },
    };
    runInNewContext(
      readFileSync(
        resolve(process.cwd(), '../web/public/push-worker.js'),
        'utf8',
      ),
      { self: worker, URL },
    );
    return { worker, client, handlers };
  }
  it('always displays a generic visible alert and signals open tabs', async () => {
    const { worker, client, handlers } = setup();
    let completion: Promise<void> = Promise.resolve();
    handlers.push!({
      data: {
        json: () => ({
          title: 'Private title',
          body: 'Private content',
          tag: 'id',
        }),
      },
      waitUntil: (promise: Promise<void>) => {
        completion = promise;
      },
    });
    await completion;
    expect(worker.registration.showNotification).toHaveBeenCalledWith(
      'A Ponte',
      expect.objectContaining({ tag: 'id', data: { url: '/inbox' } }),
    );
    expect(
      JSON.stringify(worker.registration.showNotification.mock.calls),
    ).not.toMatch(/Private title|Private content/);
    expect(client.postMessage).toHaveBeenCalledWith({
      type: 'PONTE_NOTIFICATION',
    });
  });
  it('opens the same-origin inbox even if a payload supplies an external URL', async () => {
    const { client, handlers } = setup();
    const close = jest.fn();
    let completion: Promise<void> = Promise.resolve();
    handlers.notificationclick!({
      notification: { close, data: { url: 'https://evil.example' } },
      waitUntil: (promise: Promise<void>) => {
        completion = promise;
      },
    });
    await completion;
    expect(close).toHaveBeenCalledTimes(1);
    expect(client.navigate).toHaveBeenCalledWith('https://ponte.example/inbox');
    expect(client.focus).toHaveBeenCalled();
  });
});
