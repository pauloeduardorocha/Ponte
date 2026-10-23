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
  it('displays the notification subject and message and signals open tabs', async () => {
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
      'Private title',
      expect.objectContaining({
        body: 'Private content',
        tag: 'id',
        data: { url: '/inbox' },
      }),
    );
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
  it.each([
    '/',
    '/finance?tab=reimbursements',
    '/my-events?event=id&section=refunds',
  ])(
    'preserves the supported system destination %s on display and click',
    async (url) => {
      const { worker, client, handlers } = setup();
      let completion = Promise.resolve();
      const waitUntil = (promise: Promise<void>) => {
        completion = promise;
      };
      handlers.push!({
        data: { json: () => ({ title: 'Aviso', url }) },
        waitUntil,
      });
      await completion;
      expect(worker.registration.showNotification).toHaveBeenCalledWith(
        'Aviso',
        expect.objectContaining({ data: { url } }),
      );
      handlers.notificationclick!({
        notification: { close: jest.fn(), data: { url } },
        waitUntil,
      });
      await completion;
      expect(client.navigate).toHaveBeenCalledWith(
        `https://ponte.example${url}`,
      );
    },
  );
  it.each([
    () => undefined,
    () => ({ title: 7, body: [] }),
    () => {
      throw new SyntaxError('Invalid JSON');
    },
  ])(
    'keeps a visible fallback for missing or invalid notification text',
    async (json) => {
      const { worker, handlers } = setup();
      let completion: Promise<void> = Promise.resolve();
      handlers.push!({
        data: { json },
        waitUntil: (promise: Promise<void>) => {
          completion = promise;
        },
      });
      await completion;
      expect(worker.registration.showNotification).toHaveBeenCalledWith(
        'A Ponte',
        expect.objectContaining({
          body: 'Você tem uma nova mensagem. Abra a caixa de notificações.',
        }),
      );
    },
  );
});
