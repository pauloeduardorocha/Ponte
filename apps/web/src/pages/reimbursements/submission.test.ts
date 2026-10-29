import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '../../lib/api';
import { reimbursementFileRequest } from './api';
import { createReimbursementSubmitter } from './submission';

vi.mock('../../lib/api', async (original) => ({
  ...(await original<typeof import('../../lib/api')>()),
  apiRequest: vi.fn(),
}));
vi.mock('./api', () => ({ reimbursementFileRequest: vi.fn() }));

const values = {
  iban: 'PT50000201231234567890154',
  categoryId: 'category',
  purpose: 'Material',
  amount: '25.10',
};
const begin = vi.mocked(apiRequest);
const upload = vi.mocked(reimbursementFileRequest);
const progress = vi.fn();
const read = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  begin.mockImplementation(
    async (path, options) =>
      (path.endsWith('/submissions')
        ? { id: (options?.body as { id: string }).id, chunkSize: 256 * 1024 }
        : { id: 'receipt' }) as never,
  );
  upload.mockResolvedValue(new Response());
});

describe('Resumable reimbursement submission', () => {
  it('transports a 1.6 MB document in bounded requests preserving every byte', async () => {
    const bytes = Uint8Array.from(
      { length: 1593588 },
      (_, index) => index % 251,
    );
    const file = new File([bytes], 'receipt.pdf', { type: 'application/pdf' });
    await expect(
      createReimbursementSubmitter()(values, [file], progress),
    ).resolves.toEqual({ id: 'receipt' });
    const chunks = await Promise.all(
      upload.mock.calls.map(async ([, body]) => {
        const blob = body!.get('file') as File;
        expect(blob.size).toBeLessThanOrEqual(256 * 1024);
        return new Uint8Array(await read(blob));
      }),
    );
    expect(chunks).toHaveLength(7);
    const restored = new Uint8Array(bytes.length);
    let offset = 0;
    for (const chunk of chunks) {
      restored.set(chunk, offset);
      offset += chunk.length;
    }
    expect(restored).toEqual(bytes);
    expect(progress).toHaveBeenLastCalledWith({
      sent: bytes.length,
      total: bytes.length,
      retrying: false,
    });
    expect(begin.mock.calls.at(-1)?.[0]).toMatch(/\/complete$/);
  });

  it('retries a transient failed chunk with the same session and offset', async () => {
    upload.mockRejectedValueOnce(new ApiError(503, 'Unavailable'));
    await createReimbursementSubmitter()(
      values,
      [new File(['%PDF-data'], 'r.pdf', { type: 'application/pdf' })],
      progress,
    );
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0]![0]).toBe(upload.mock.calls[1]![0]);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ retrying: true }),
    );
  });

  it('retries a lost final response without resending documents', async () => {
    const implementation = begin.getMockImplementation()!;
    let finals = 0;
    begin.mockImplementation(async (path, options) => {
      if (path.endsWith('/complete') && finals++ === 0)
        throw new ApiError(0, 'Lost response');
      return implementation(path, options);
    });
    await createReimbursementSubmitter()(
      values,
      [new File(['%PDF-data'], 'r.pdf', { type: 'application/pdf' })],
      progress,
    );
    expect(upload).toHaveBeenCalledTimes(1);
    const completePaths = begin.mock.calls
      .filter(([path]) => path.endsWith('/complete'))
      .map(([path]) => path);
    expect(completePaths).toHaveLength(2);
    expect(completePaths[0]).toBe(completePaths[1]);
  });

  it('resumes after manual retry, skipping confirmed chunks, and allocates a new key only for changed data', async () => {
    const submit = createReimbursementSubmitter();
    const files = [
      new File(['%PDF-data'], 'r.pdf', { type: 'application/pdf' }),
    ];
    const implementation = begin.getMockImplementation()!;
    let fail = true;
    begin.mockImplementation(async (path, options) => {
      if (path.endsWith('/complete') && fail)
        throw new ApiError(400, 'Incomplete');
      return implementation(path, options);
    });
    await expect(submit(values, files, progress)).rejects.toThrow('Incomplete');
    expect(
      begin.mock.calls.filter(([path]) => path.endsWith('/complete')),
    ).toHaveLength(1);
    fail = false;
    await submit(values, files, progress);
    expect(upload).toHaveBeenCalledTimes(1);
    const firstId = (begin.mock.calls[0]![1]!.body as { id: string }).id;
    expect((begin.mock.calls[2]![1]!.body as { id: string }).id).toBe(firstId);
    await submit({ ...values, amount: '50.00' }, files, progress);
    expect(upload).toHaveBeenCalledTimes(2);
    expect((begin.mock.calls[4]![1]!.body as { id: string }).id).not.toBe(
      firstId,
    );
  });

  it('bounds automatic retries and never finalizes an incomplete upload', async () => {
    upload.mockRejectedValue(new ApiError(503, 'Unavailable'));
    await expect(
      createReimbursementSubmitter()(
        values,
        [new File(['data'], 'r.pdf')],
        progress,
      ),
    ).rejects.toThrow('Unavailable');
    expect(upload).toHaveBeenCalledTimes(3);
    expect(begin).toHaveBeenCalledTimes(1);
  });
});
