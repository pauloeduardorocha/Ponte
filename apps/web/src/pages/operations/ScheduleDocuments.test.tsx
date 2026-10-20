import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ScheduleDocuments } from './ScheduleDocuments';
import { apiRequest } from '../../lib/api';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('../../components/DocumentGallery', () => ({
  DocumentGallery: () => <div>Gallery</div>,
}));
beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue([]);
});
afterEach(cleanup);
function show(canManage = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onDeleted = vi.fn();
  const result = render(
    <QueryClientProvider client={client}>
      <ScheduleDocuments
        id="schedule"
        canManage={canManage}
        onDeleted={onDeleted}
      />
    </QueryClientProvider>,
  );
  return { ...result, onDeleted };
}
it('hides upload and deletion from ordinary members', async () => {
  show(false);
  await screen.findByText('Nenhum anexo nesta escala.');
  expect(screen.queryByText('Anexar arquivo')).not.toBeInTheDocument();
  expect(screen.queryByText('Excluir escala')).not.toBeInTheDocument();
});
it('rejects an oversized file before sending it', async () => {
  const { container } = show();
  const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.pdf', {
    type: 'application/pdf',
  });
  fireEvent.change(container.querySelector('input[type=file]')!, {
    target: { files: [file] },
  });
  await screen.findByRole('alert');
  expect(
    vi
      .mocked(apiRequest)
      .mock.calls.some(([, options]) => options?.method === 'POST'),
  ).toBe(false);
});
it('uploads the original binary through multipart form data', async () => {
  const { container } = show();
  const file = new File(['music'], 'song.mp3', { type: 'audio/mpeg' });
  fireEvent.change(container.querySelector('input[type=file]')!, {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.some(([, options]) => options?.body instanceof FormData),
    ).toBe(true),
  );
});
it('requires confirmation before deleting a schedule', async () => {
  const { onDeleted } = show();
  fireEvent.click(screen.getByRole('button', { name: 'Excluir escala' }));
  expect(
    vi
      .mocked(apiRequest)
      .mock.calls.some(([, options]) => options?.method === 'DELETE'),
  ).toBe(false);
  fireEvent.click(await screen.findByRole('button', { name: /^Excluir$/ }));
  await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  expect(apiRequest).toHaveBeenCalledWith('/operations/schedules/schedule', {
    method: 'DELETE',
  });
});

it('splits a 5 MB file into ordered requests below the hosting limit', async () => {
  vi.mocked(apiRequest).mockImplementation(async (_path, options) =>
    options?.method === 'POST' ? ({ id: 'chunked' } as never) : ([] as never),
  );
  const { container } = show();
  const file = new File([new Uint8Array(5 * 1024 * 1024)], 'music.mp3', {
    type: 'audio/mpeg',
  });
  fireEvent.change(container.querySelector('input[type=file]')!, {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.filter(([, options]) => options?.method === 'POST'),
    ).toHaveLength(3),
  );
  const calls = vi
    .mocked(apiRequest)
    .mock.calls.filter(([, options]) => options?.method === 'POST');
  expect(calls.map(([path]) => path)).toEqual([
    '/operations/schedules/schedule/attachments/chunks/5242880',
    '/operations/schedules/schedule/attachments/chunked/chunks/2097152',
    '/operations/schedules/schedule/attachments/chunked/chunks/4194304',
  ]);
  for (const [, options] of calls)
    expect((options?.body as FormData).get('file')).toHaveProperty(
      'size',
      expect.any(Number),
    );
});
