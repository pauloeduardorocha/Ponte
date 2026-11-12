import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const worker = readFileSync(
  existsSync(resolve('apps/web/public/push-worker.js'))
    ? resolve('apps/web/public/push-worker.js')
    : resolve('public/push-worker.js'),
  'utf8',
);

async function push(locale: string, payload?: { title: string; body: string }) {
  const handlers = new Map<
    string,
    (event: {
      data?: { json: () => unknown };
      waitUntil: (promise: Promise<void>) => void;
    }) => void
  >();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const match = vi.fn().mockResolvedValue(new Response(locale));
  runInNewContext(worker, {
    URL,
    caches: { open: vi.fn().mockResolvedValue({ match }) },
    self: {
      location: { origin: 'https://ponte.example' },
      registration: { showNotification },
      clients: { matchAll: vi.fn().mockResolvedValue([]) },
      addEventListener: (
        name: string,
        handler: (event: {
          data?: { json: () => unknown };
          waitUntil: (promise: Promise<void>) => void;
        }) => void,
      ) => handlers.set(name, handler),
    },
  });
  let completed: Promise<void> | undefined;
  handlers.get('push')!({
    data: payload ? { json: () => payload } : undefined,
    waitUntil: (promise) => {
      completed = promise;
    },
  });
  await completed;
  return showNotification.mock.calls[0] as [string, { body: string }];
}

describe('PWA notification language', () => {
  it.each([
    ['pt-PT', 'Tem uma nova mensagem. Abra a caixa de notificações.'],
    ['pt-BR', 'Você tem uma nova mensagem. Abra a caixa de notificações.'],
    ['en', 'You have a new message. Open your notifications inbox.'],
    ['invalid', 'Tem uma nova mensagem. Abra a caixa de notificações.'],
  ])(
    'uses the saved language %s for application fallback copy',
    async (locale, expected) => {
      expect((await push(locale))[1].body).toBe(expected);
    },
  );

  it('preserves notification content supplied by the sender', async () => {
    expect(
      await push('en', { title: 'Minha conta', body: 'Mensagem em português' }),
    ).toEqual([
      'Minha conta',
      expect.objectContaining({ body: 'Mensagem em português' }),
    ]);
  });
});
