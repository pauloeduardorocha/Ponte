import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { StorageService, MAX_ATTACHMENT_SIZE } from './storage.service';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../../database/prisma.service';
describe('Private financial storage', () => {
  let root: string;
  let storage: StorageService;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'finance-storage-'));
    storage = new StorageService(
      new ConfigService({ PRIVATE_STORAGE_PATH: root }),
    );
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const pdf = () => ({
    originalname: 'comprovante.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7 document'),
    size: 17,
  });
  it('stores only random keys and downloads the same content', async () => {
    const file = pdf();
    file.size = file.buffer.length;
    const key = await storage.put(file);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(await storage.get(key)).toEqual(file.buffer);
    await storage.remove(key);
    await expect(storage.get(key)).rejects.toThrow();
  });
  it('rejects spoofed MIME, extensions, signatures, missing files, and oversized uploads', () => {
    const good = pdf();
    good.size = good.buffer.length;
    for (const bad of [
      { ...good, mimetype: 'text/html' },
      { ...good, originalname: 'evil.exe' },
      { ...good, buffer: Buffer.from('not a pdf') },
      { ...good, size: MAX_ATTACHMENT_SIZE + 1 },
      { ...good, size: 0 },
    ])
      expect(() => storage.validate(bad)).toThrow(BadRequestException);
    expect(() => storage.validate(undefined!)).toThrow(BadRequestException);
  });
  it('rejects path traversal keys', async () => {
    await expect(storage.get('../secret')).rejects.toThrow(BadRequestException);
  });
  it('persists attachments across service instances with database storage', async () => {
    const files = new Map<string, { id: string; content: Buffer }>();
    const db = {
      privateFile: {
        create: jest.fn(async ({ data }) => {
          files.set(data.id, data);
          return data;
        }),
        findUnique: jest.fn(async ({ where }) => files.get(where.id) ?? null),
        deleteMany: jest.fn(async ({ where }) => {
          files.delete(where.id);
          return { count: 1 };
        }),
      },
    } as unknown as PrismaService;
    const config = new ConfigService({
      PRIVATE_STORAGE_DRIVER: 'database',
      VERCEL: '1',
    });
    const writer = new StorageService(config, db);
    const reader = new StorageService(config, db);
    const file = pdf();
    file.size = file.buffer.length;
    const key = await writer.put(file);
    expect(await reader.get(key)).toEqual(file.buffer);
    await expect(reader.get('../secret')).rejects.toThrow(BadRequestException);
    await reader.remove(key);
    await expect(writer.get(key)).rejects.toThrow('Arquivo indisponível');
  });
  it('refuses ephemeral filesystem storage on Vercel', () => {
    expect(
      () => new StorageService(new ConfigService({ VERCEL: '1' })),
    ).toThrow('PRIVATE_STORAGE_DRIVER=database');
  });
});
