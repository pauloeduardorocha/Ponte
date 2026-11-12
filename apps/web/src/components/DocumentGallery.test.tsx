import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentGallery } from './DocumentGallery';
import { resetTestState } from '../test/utils';
import { setAccessToken } from '../lib/api';

vi.mock('./PdfPreview', () => ({
  PdfPreview: ({ thumbnail }: { thumbnail?: boolean }) => (
    <div>{thumbnail ? 'Miniatura PDF' : 'PDF completo'}</div>
  ),
}));
function gallery(
  documents: Parameters<typeof DocumentGallery>[0]['documents'],
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DocumentGallery documents={documents} />
    </QueryClientProvider>,
  );
}
describe('Private and local document gallery', () => {
  beforeEach(resetTestState);
  it('shows local thumbnails, opens full screen, zooms and navigates without uploading', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    gallery([
      {
        id: 'photo',
        filename: 'recibo.jpg',
        file: new File(['image'], 'recibo.jpg', { type: 'image/jpeg' }),
      },
      {
        id: 'pdf',
        filename: 'fatura.pdf',
        file: new File(['%PDF-test'], 'fatura.pdf', {
          type: 'application/pdf',
        }),
      },
    ]);
    await screen.findByRole('img', { name: 'recibo.jpg' });
    await screen.findByText('Miniatura PDF');
    fireEvent.click(screen.getByRole('button', { name: 'Ver recibo.jpg' }));
    expect(
      await screen.findByRole('dialog', { name: 'recibo.jpg' }),
    ).toHaveClass('MuiDialog-paperFullScreen');
    expect(
      document.querySelector('.MuiDialog-paperFullScreen'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar zoom' }));
    expect(
      screen.getByRole('button', { name: 'Repor zoom' }),
    ).toHaveTextContent('150%');
    fireEvent.click(screen.getByRole('button', { name: 'Anexo seguinte' }));
    expect(
      await screen.findByRole('dialog', { name: 'fatura.pdf' }),
    ).toBeInTheDocument();
    expect(screen.getByText('PDF completo')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Fechar visualização' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('fetches private bytes with authentication and reuses them for full screen', async () => {
    setAccessToken('private-session');
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(new Blob(['image'], { type: 'image/jpeg' })),
      );
    vi.stubGlobal('fetch', fetch);
    gallery([
      {
        id: 'stored',
        filename: 'comprovativo.jpg',
        path: '/reimbursements/request/attachments/stored/download',
      },
    ]);
    await screen.findByRole('img', { name: 'comprovativo.jpg' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Ver comprovativo.jpg' }),
    );
    await screen.findByRole('dialog', { name: 'comprovativo.jpg' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer private-session' },
      credentials: 'include',
    });
    expect(screen.getByRole('link', { name: 'Descarregar' })).toHaveAttribute(
      'download',
      'comprovativo.jpg',
    );
  });
  it('revokes private object URLs when the gallery is removed', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const view = gallery([
      {
        id: 'local',
        filename: 'recibo.jpg',
        file: new File(['image'], 'recibo.jpg', { type: 'image/jpeg' }),
      },
    ]);
    await screen.findByRole('img', { name: 'recibo.jpg' });
    view.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:document-preview');
  });
  it('assembles a 5 MB document from authenticated byte ranges', async () => {
    setAccessToken('private-session');
    const size = 5 * 1024 * 1024;
    const fetch = vi.fn(async (_url, options: RequestInit) => {
      const range = (options.headers as Record<string, string>).Range!;
      const match = /^bytes=(\d+)-(\d+)$/.exec(range)!;
      const start = Number(match[1]),
        end = Number(match[2]);
      return new Response(new Uint8Array(end - start + 1), {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Type': 'image/jpeg',
        },
      });
    });
    vi.stubGlobal('fetch', fetch);
    gallery([
      {
        id: 'large',
        filename: 'large.jpg',
        path: '/operations/schedules/s/attachments/f',
        size,
        ranged: true,
      },
    ]);
    await screen.findByRole('img', { name: 'large.jpg' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      fetch.mock.calls.map(
        ([, options]) => (options.headers as Record<string, string>).Range,
      ),
    ).toEqual([
      'bytes=0-2097151',
      'bytes=2097152-4194303',
      'bytes=4194304-5242879',
    ]);
  });
});
