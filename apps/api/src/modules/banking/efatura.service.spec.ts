import { EventEmitter } from 'node:events';
import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { EfaturaService } from './efatura.service';
import { PrismaService } from '../../database/prisma.service';
import { InvoicesService } from './invoices.service';
import type { CurrentUser } from '@church/shared';

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  fork: jest.fn(),
}));
jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: jest.fn(),
}));

describe('e-Fatura integration', () => {
  const user = { id: 'operator' } as CurrentUser;
  function fixture() {
    const db = {
      bankImport: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'import-1', status: 'CONFIRMED' }),
      },
      bankTransaction: {
        aggregate: jest.fn().mockResolvedValue({
          _min: { date: new Date('2026-08-01') },
          _max: { date: new Date('2026-10-07') },
        }),
      },
    };
    const invoices = {
      upload: jest.fn().mockResolvedValue({ inserted: 2, duplicates: 0 }),
    };
    const worker = Object.assign(new EventEmitter(), {
      kill: jest.fn(),
      send: jest.fn((_config, callback) => callback()),
    });
    (fork as jest.Mock).mockReturnValue(worker);
    (existsSync as jest.Mock).mockReturnValue(true);
    const service = new EfaturaService(
      db as unknown as PrismaService,
      invoices as unknown as InvoicesService,
    );
    return { service, worker, db, invoices };
  }
  beforeEach(() => jest.clearAllMocks());
  it('sends credentials only through IPC, derives the full statement period and imports the result', async () => {
    const { service, worker, invoices } = fixture();
    const dto = {
      bankImportId: 'import-1',
      nif: '123456789',
      password: 'temporary-secret',
    };
    const pending = service.fetch(dto, user);
    await new Promise(setImmediate);
    expect(fork).toHaveBeenCalledWith(
      expect.stringContaining('teste.js'),
      [],
      expect.objectContaining({
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      }),
    );
    expect(worker.send).toHaveBeenCalledWith(
      {
        nif: '123456789',
        password: 'temporary-secret',
        bankImportId: 'import-1',
        period: { start: '2026-08-01', end: '2026-10-07' },
      },
      expect.any(Function),
    );
    expect(dto.password).toBe('');
    const result = { schemaVersion: 1, source: 'E_FATURA', invoices: [] };
    worker.emit('message', { result });
    worker.emit('exit', 0);
    await expect(pending).resolves.toEqual({ inserted: 2, duplicates: 0 });
    const file = invoices.upload.mock.calls[0][0];
    expect(JSON.parse(file.buffer.toString())).toEqual(result);
    expect(file.buffer.toString()).not.toContain('temporary-secret');
  });
  it('waits for worker cleanup on login failure and leaves the bank import untouched', async () => {
    const { service, worker, invoices, db } = fixture();
    const pending = service.fetch(
      { bankImportId: 'import-1', nif: '123456789', password: 'secret' },
      user,
    );
    const rejection = expect(pending).rejects.toThrow(
      'Confira o NIF e a senha',
    );
    await new Promise(setImmediate);
    worker.emit('message', { error: 'CONSULTATION_FAILED' });
    expect(worker.kill).not.toHaveBeenCalled();
    worker.emit('exit', 1);
    await rejection;
    expect(invoices.upload).not.toHaveBeenCalled();
    expect(db.bankImport.findUnique).toHaveBeenCalledTimes(1);
  });
  it('times out a stalled browser and blocks overlapping consultations', async () => {
    const { service, worker } = fixture();
    jest.useFakeTimers();
    try {
      const pending = service.fetch(
        { bankImportId: 'import-1', nif: '123456789', password: 'secret' },
        user,
      );
      const rejected = expect(pending).rejects.toThrow('demorou demasiado');
      await jest.advanceTimersByTimeAsync(1);
      await expect(
        service.fetch(
          { bankImportId: 'import-1', nif: '123456789', password: 'secret' },
          user,
        ),
      ).rejects.toThrow('em andamento');
      await jest.advanceTimersByTimeAsync(120000);
      await rejected;
      expect(worker.kill).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
