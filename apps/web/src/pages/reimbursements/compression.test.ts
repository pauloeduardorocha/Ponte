import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  prepareReimbursementFile,
  prepareReimbursementFiles,
  prepareReimbursementCameraPhoto,
} from './api';

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

  it.each([523015, 1972808])(
    'normalizes a %i-byte camera capture into a smaller JPEG',
    async (size) => {
      const { bitmap, drawImage } = canvas([900000, 700000]);
      const result = await prepareReimbursementCameraPhoto(photo(size));
      expect(result.size).toBeLessThanOrEqual(768 * 1024);
      expect(result.type).toBe('image/jpeg');
      expect(result.name).toBe('foto.jpg');
      expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2560, 1707);
      expect(bitmap.close).toHaveBeenCalledOnce();
    },
  );

  it('does not send an oversized camera capture if optimization fails', async () => {
    canvas([900000]);
    await expect(
      prepareReimbursementCameraPhoto(photo(1972808)),
    ).rejects.toThrow('continua demasiado grande');
  });

  it('preserves photos already below the target and rejects originals above 10 MB', async () => {
    const original = photo(mb);
    const prepared = await prepareReimbursementFile(original);
    expect(prepared).not.toBe(original);
    expect(prepared.size).toBe(original.size);
    expect(prepared.name).toBe(original.name);
    expect(prepared.type).toBe(original.type);
    await expect(prepareReimbursementFile(photo(10 * mb + 1))).rejects.toThrow(
      '10 MB',
    );
  });

  it('rejects unreadable camera files during preparation instead of during upload', async () => {
    vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(
      function (this: FileReader) {
        this.dispatchEvent(new ProgressEvent('error'));
      },
    );
    await expect(prepareReimbursementFile(photo(mb))).rejects.toThrow(
      'Selecione o ficheiro novamente',
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
    const prepared = await prepareReimbursementFile(pdf);
    expect(prepared).not.toBe(pdf);
    const read = (file: File) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsText(file);
      });
    expect(await read(prepared)).toBe('%PDF-test');
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockRejectedValue(new Error('decode failed')),
    );
    await expect(prepareReimbursementFile(photo(3 * mb))).rejects.toThrow(
      'Não foi possível ler',
    );
  });
});
