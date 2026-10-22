import { getAccessToken, withErrorReference } from '../../lib/api';

export const PHOTO_LIMIT = 10 * 1024 * 1024;
const UPLOAD_LIMIT = 2 * 1024 * 1024;
const PDF_LIMIT = 1024 * 1024;
const BATCH_LIMIT = 4 * 1024 * 1024;

/** Keep camera photos readable while fitting the hosted API's request limit. */
export async function prepareReimbursementFile(
  file: File,
  targetBytes = UPLOAD_LIMIT,
): Promise<File> {
  const image = ['image/jpeg', 'image/png'].includes(file.type);
  if ((!image && file.type !== 'application/pdf') || file.size < 1) {
    throw new Error('Selecione um PDF ou uma imagem JPEG/PNG.');
  }
  if (file.size > (image ? PHOTO_LIMIT : PDF_LIMIT)) {
    throw new Error('Cada foto pode ter até 10 MB; cada PDF, até 1 MB.');
  }
  if (!image || file.size <= targetBytes) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      'Não foi possível ler esta foto. Experimente guardar como JPEG.',
    );
  }
  try {
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error('Não foi possível preparar a foto neste navegador.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.92, 0.85, 0.78, 0.7, 0.6, 0.5, 0.4]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      );
      if (blob && blob.size <= targetBytes) {
        const filename = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], filename, {
          type: 'image/jpeg',
          lastModified: file.lastModified,
        });
      }
    }
    throw new Error(
      'Esta foto continua demasiado grande após a otimização. Fotografe apenas o documento.',
    );
  } finally {
    bitmap.close();
  }
}

export async function prepareReimbursementFiles(
  files: File[],
): Promise<File[]> {
  const prepared: File[] = [];
  for (const file of files) prepared.push(await prepareReimbursementFile(file));
  if (prepared.reduce((total, file) => total + file.size, 0) <= BATCH_LIMIT)
    return prepared;
  const pdfBytes = prepared
    .filter((file) => file.type === 'application/pdf')
    .reduce((total, file) => total + file.size, 0);
  const imageCount = prepared.filter(
    (file) => file.type !== 'application/pdf',
  ).length;
  const target = Math.min(
    UPLOAD_LIMIT,
    Math.floor((BATCH_LIMIT - pdfBytes) / imageCount),
  );
  const fitted: File[] = [];
  for (const file of prepared)
    fitted.push(await prepareReimbursementFile(file, target));
  return fitted;
}

export type ReimbursementFile = {
  id: string;
  filename: string;
  kind: 'DOCUMENT' | 'PAYMENT';
  size: number;
};
export type Reimbursement = {
  categoryId: string | null;
  category: { id: string; name: string } | null;
  id: string;
  submittedBy?: string | null;
  deletedAt?: string | null;
  beneficiaryName: string;
  iban: string;
  purpose: string;
  amount: string | null;
  currency: string;
  paidAt: string | null;
  bankTransactionId: string | null;
  createdAt: string;
  status: 'INCOMPLETE' | 'READY' | 'PAID' | 'LINKED';
  attachments: ReimbursementFile[];
};
export const statuses = {
  INCOMPLETE: 'Por completar',
  READY: 'Pronto para pagamento',
  PAID: 'Pago · a aguardar movimento',
  LINKED: 'Associado ao banco',
};
export const money = (amount: string | null, currency = 'EUR') =>
  amount
    ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(
        Number(amount),
      )
    : 'Valor por preencher';
export async function reimbursementFileRequest(path: string, body?: FormData) {
  const token = getAccessToken();
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? '/api/v1'}/reimbursements${path}`,
    {
      method: body ? 'POST' : 'GET',
      body,
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      withErrorReference(
        Array.isArray(data?.message)
          ? data.message.join(', ')
          : (data?.message ?? 'Não foi possível processar o documento.'),
        data,
      ),
    );
  }
  return response;
}
export async function downloadReimbursementFile(
  id: string,
  file: ReimbursementFile,
) {
  const response = await reimbursementFileRequest(
    `/${id}/attachments/${file.id}/download`,
  );
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
