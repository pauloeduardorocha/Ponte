import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
export interface PrivateUpload {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
@Injectable()
export class StorageService {
  private readonly root: string;
  constructor(config: ConfigService) {
    this.root = resolve(
      config.get<string>('PRIVATE_STORAGE_PATH') ?? './private-storage',
    );
  }
  validate(file: PrivateUpload) {
    if (
      !file?.buffer ||
      file.size !== file.buffer.length ||
      file.size < 1 ||
      file.size > MAX_ATTACHMENT_SIZE
    )
      throw new BadRequestException('Arquivo deve ter entre 1 byte e 10 MB');
    if (
      !file.originalname ||
      /[\\/:]/.test(file.originalname) ||
      [...file.originalname].some((c) => c.charCodeAt(0) < 32)
    )
      throw new BadRequestException('Nome de arquivo inválido');
    const ext = extname(file.originalname).toLowerCase();
    const b = file.buffer;
    const valid =
      (ext === '.pdf' &&
        file.mimetype === 'application/pdf' &&
        b.subarray(0, 5).toString() === '%PDF-') ||
      (['.jpg', '.jpeg'].includes(ext) &&
        file.mimetype === 'image/jpeg' &&
        b.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) ||
      (ext === '.png' &&
        file.mimetype === 'image/png' &&
        b
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    if (
      !valid ||
      file.originalname.length > 255 ||
      [...file.originalname].some((char) => char.charCodeAt(0) < 32)
    )
      throw new BadRequestException(
        'MIME, extensão ou assinatura inválida; use PDF, JPEG ou PNG',
      );
  }
  private path(key: string) {
    if (!/^[0-9a-f-]{36}$/.test(key))
      throw new BadRequestException('Chave inválida');
    return resolve(this.root, key);
  }
  async put(file: PrivateUpload) {
    this.validate(file);
    return this.putValidated(file);
  }
  async putValidated(file: PrivateUpload) {
    if (
      !file?.buffer ||
      file.size !== file.buffer.length ||
      file.size < 1 ||
      file.size > MAX_ATTACHMENT_SIZE
    )
      throw new BadRequestException();
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const key = randomUUID();
    await writeFile(this.path(key), file.buffer, { flag: 'wx', mode: 0o600 });
    return key;
  }
  async get(key: string) {
    try {
      return await readFile(this.path(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        throw new NotFoundException('Arquivo indisponível');
      throw e;
    }
  }
  async remove(key: string) {
    await unlink(this.path(key));
  }
}
