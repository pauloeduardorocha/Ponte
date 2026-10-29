import { ApiError, apiRequest } from '../../lib/api';
import { reimbursementFileRequest } from './api';

const CHUNK_SIZE = 256 * 1024;
type Values = {
  iban: string;
  categoryId: string;
  purpose: string;
  amount: string;
};
type Receipt = { id: string; possibleDuplicate?: boolean };
export type SubmissionProgress = {
  sent: number;
  total: number;
  retrying: boolean;
};

function readBytes(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reader.onabort = () =>
      reject(
        new Error('Não foi possível ler o documento. Selecione-o novamente.'),
      );
    reader.readAsArrayBuffer(file);
  });
}

// This instance lives with the form. Preserve successful chunks and the receipt
// key across manual retries, without persisting documents in browser storage.
export function createReimbursementSubmitter() {
  let previous:
    { fingerprint: string; id: string; uploaded: Set<string> } | undefined;
  return async (
    values: Values,
    files: File[],
    progress: (value: SubmissionProgress) => void,
  ): Promise<Receipt> => {
    const manifest = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        sha256: Array.from(
          new Uint8Array(
            await crypto.subtle.digest('SHA-256', await readBytes(file)),
          ),
        )
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(''),
      })),
    );
    const fingerprint = JSON.stringify({ ...values, files: manifest });
    if (previous?.fingerprint !== fingerprint)
      previous = { fingerprint, id: crypto.randomUUID(), uploaded: new Set() };
    const session = previous;
    const total = files.reduce((sum, file) => sum + file.size, 0);
    let sent = 0;
    const report = (retrying = false) => progress({ sent, total, retrying });
    async function retry<T>(operation: () => Promise<T>): Promise<T> {
      for (let attempt = 0; ; attempt++) {
        try {
          return await operation();
        } catch (error) {
          if (
            !(error instanceof ApiError) ||
            ![0, 502, 503, 504].includes(error.status) ||
            attempt >= 2
          )
            throw error;
          report(true);
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * 2 ** attempt + Math.random() * 250),
          );
          report();
        }
      }
    }
    report();
    const started = await retry(() =>
      apiRequest<{ id: string; chunkSize: number }>(
        '/reimbursements/submissions',
        {
          method: 'POST',
          body: { ...values, id: session.id, files: manifest },
        },
      ),
    );
    if (started.id !== session.id || started.chunkSize !== CHUNK_SIZE)
      throw new Error('Não foi possível iniciar o envio. Recarregue a página.');
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex]!;
      for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
        const key = `${fileIndex}:${offset}`;
        const chunk = file.slice(
          offset,
          Math.min(offset + CHUNK_SIZE, file.size),
        );
        if (!session.uploaded.has(key)) {
          await retry(async () => {
            const body = new FormData();
            body.append('file', chunk, 'chunk');
            await reimbursementFileRequest(
              `/submissions/${session.id}/files/${fileIndex}/chunks/${offset}`,
              body,
            );
          });
          session.uploaded.add(key);
        }
        sent += chunk.size;
        report();
      }
    }
    return retry(() =>
      apiRequest<Receipt>(
        `/reimbursements/submissions/${session.id}/complete`,
        { method: 'POST' },
      ),
    );
  };
}
