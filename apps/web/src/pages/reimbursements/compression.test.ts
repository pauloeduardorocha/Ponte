import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareReimbursementFile, prepareReimbursementFiles } from './api';

const mb = 1024 * 1024;
const photo = (size: number) =>
  new File([new Uint8Array(size)], 'foto.png', { type: 'image/png' });

describe('Reimbursement photo compression', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function canvas(outputSizes: number[]) {
    const bitmap = { width: 6000, height: 4000, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const sizes = [...outputSizes];
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) =>
        callback(
          new Blob([new Uint8Array(sizes.shift() ?? outputSizes.at(-1)!)], {
            type: 'image/jpeg',
          }),
        ),
    );
    return { bitmap, drawImage };
  }

  it('accepts an 8 MB photo and reduces quality to fit 2 MB without cropping', async () => {
    const { bitmap, drawImage } = canvas([
      Math.floor(2.5 * mb),
      Math.floor(1.8 * mb),
    ]);
    const result = await prepareReimbursementFile(photo(8 * mb));
    expect(result.size).toBeLessThanOrEqual(2 * mb);
    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('foto.jpg');
    // The complete source image is drawn, with proportional scaling; no crop rectangle.
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 4096, 2731);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(2);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('preserves photos already below the target and rejects originals above 10 MB', async () => {
    const original = photo(mb);
    expect(await prepareReimbursementFile(original)).toBe(original);
    await expect(prepareReimbursementFile(photo(10 * mb + 1))).rejects.toThrow(
      '10 MB',
    );
  });

  it('fits three photos into one hosted request without dropping any document', async () => {
    canvas([Math.floor(1.2 * mb)]);
    const result = await prepareReimbursementFiles([
      photo(2 * mb),
      photo(2 * mb),
      photo(2 * mb),
    ]);
    expect(result).toHaveLength(3);
    expect(
      result.reduce((total, file) => total + file.size, 0),
    ).toBeLessThanOrEqual(4 * mb);
  });

  it('keeps PDFs unchanged and reports unreadable images', async () => {
    const pdf = new File(['%PDF-test'], 'recibo.pdf', {
      type: 'application/pdf',
    });
    expect(await prepareReimbursementFile(pdf)).toBe(pdf);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockRejectedValue(new Error('decode failed')),
    );
    await expect(prepareReimbursementFile(photo(3 * mb))).rejects.toThrow(
      'Não foi possível ler',
    );
  });
});
