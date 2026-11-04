import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressAvatar, MAX_AVATAR_BYTES } from './avatar';
afterEach(() => vi.restoreAllMocks());
describe('avatar compression', () => {
  it('rejects unsupported formats before decoding', async () => {
    await expect(
      compressAvatar(
        new File(['<svg/>'], 'photo.svg', { type: 'image/svg+xml' }),
      ),
    ).rejects.toThrow('JPEG');
  });
  it('reduces an oversized encoded image and releases the source URL', async () => {
    const revoke = vi.fn();
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 4000;
        naturalHeight = 2000;
        src = '';
        decode = async () => {};
      },
    );
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:photo'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revoke,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const encode = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementationOnce((cb) =>
        cb(
          new Blob([new Uint8Array(MAX_AVATAR_BYTES + 1)], {
            type: 'image/jpeg',
          }),
        ),
      )
      .mockImplementation((cb) =>
        cb(new Blob(['small'], { type: 'image/jpeg' })),
      );
    const result = await compressAvatar(
      new File(['source'], 'photo.png', { type: 'image/png' }),
    );
    expect(result).toBe('data:image/jpeg;base64,c21hbGw=');
    expect(encode).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledWith('blob:photo');
    vi.unstubAllGlobals();
  });
});
