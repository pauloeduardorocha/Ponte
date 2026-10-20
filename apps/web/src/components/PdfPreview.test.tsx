import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfPreview } from './PdfPreview';
import { resetTestState } from '../test/utils';

const pdfjs = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
}));
vi.mock('pdfjs-dist', () => pdfjs);
const blob = { arrayBuffer: async () => new ArrayBuffer(8) } as Blob;
function setup() {
  const renderPage = vi
    .fn()
    .mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
  const getPage = vi
    .fn()
    .mockResolvedValue({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
      }),
      render: renderPage,
    });
  const destroy = vi.fn().mockResolvedValue(undefined);
  pdfjs.getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 2, getPage }),
    destroy,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
  return { getPage, renderPage, destroy };
}
describe('PDF document preview', () => {
  beforeEach(() => {
    resetTestState();
    vi.restoreAllMocks();
    pdfjs.getDocument.mockReset();
  });
  it('renders the first page as a thumbnail and releases its worker on unmount', async () => {
    const { renderPage, destroy } = setup();
    const view = render(<PdfPreview blob={blob} thumbnail />);
    await waitFor(() => expect(renderPage).toHaveBeenCalled());
    expect(renderPage.mock.calls[0]?.[0].viewport.width).toBe(300);
    expect(
      screen.queryByRole('button', { name: 'Página seguinte' }),
    ).not.toBeInTheDocument();
    view.unmount();
    expect(destroy).toHaveBeenCalled();
  });
  it('lets the reader navigate all PDF pages', async () => {
    const { getPage } = setup();
    render(<PdfPreview blob={blob} />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Página seguinte' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Página seguinte' }));
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(2));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
  it('offers a readable fallback for corrupt or protected PDFs', async () => {
    pdfjs.getDocument.mockReturnValue({
      promise: Promise.reject(new Error('Invalid PDF')),
      destroy: vi.fn().mockResolvedValue(undefined),
    });
    render(<PdfPreview blob={blob} />);
    expect(
      await screen.findByText(/Não foi possível visualizar este PDF/),
    ).toBeInTheDocument();
  });
});
