import { EventEmitter } from 'node:events';
import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { EfaturaService } from './efatura.service';
import { PrismaService } from '../../database/prisma.service';
import { InvoicesService } from './invoices.service';
import type { CurrentUser } from '@church/shared';
import { Logger } from '@nestjs/common';
import { requestTrace } from '../../common/request-trace';

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
      stderr: new EventEmitter(),
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
  it.each([
    [
      'normalize_page',
      'INVOICE_OUTSIDE_PERIOD',
      'normalize_page',
      'INVOICE_OUTSIDE_PERIOD',
    ],
    ['private-secret', 'private-secret', 'unknown', 'UNKNOWN'],
  ])(
    'logs only approved extraction diagnostics (%s)',
    async (operation, failureCode, expectedOperation, expectedCode) => {
      const { service, worker, invoices } = fixture();
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      try {
        const pending = service.fetch(
          { bankImportId: 'import-1', nif: '123456789', password: 'secret' },
          user,
        );
        const rejected = expect(pending).rejects.toThrow('ler as faturas');
        await new Promise(setImmediate);
        worker.emit('message', {
          error: 'CONSULTATION_FAILED',
          stage: 'extraction',
          operation,
          failureCode,
          field: 'private-secret',
        });
        worker.emit('exit', 1);
        await rejected;
        const logs = warn.mock.calls.map(([message]) => String(message));
        expect(logs.map((message) => JSON.parse(message))).toContainEqual(
          expect.objectContaining({
            event: 'efatura.consultation.failed',
            operation: expectedOperation,
            failureCode: expectedCode,
          }),
        );
        expect(logs.join('')).not.toContain('private-secret');
        expect(invoices.upload).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    },
  );
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
      expect.stringContaining('worker.cjs'),
      [],
      expect.objectContaining({
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
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
  it.each([
    [1, null, 'MODULE_NOT_FOUND'],
    [null, 'SIGKILL', 'NONE'],
    [0, null, 'NONE'],
  ])(
    'diagnoses incomplete exit %s/%s without logging private stderr',
    async (code, signal, stderrCode) => {
      const { service, worker, invoices } = fixture();
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      try {
        const pending = requestTrace.run(
          { requestId: 'test-reference', startedAt: performance.now() },
          () =>
            service.fetch(
              {
                bankImportId: 'import-1',
                nif: '123456789',
                password: 'temporary-secret',
              },
              user,
            ),
        );
        const rejected = expect(pending).rejects.toThrow('não foi concluída');
        await new Promise(setImmediate);
        worker.emit('message', { stage: 'extraction' });
        worker.emit('message', { stage: 'temporary-secret' });
        if (stderrCode === 'MODULE_NOT_FOUND') {
          worker.stderr.emit(
            'data',
            Buffer.from(
              "Error: private invoice temporary-secret 123456789\ncode: 'MODULE_NOT_",
            ),
          );
          worker.stderr.emit('data', Buffer.from("FOUND'"));
        }
        worker.emit('exit', code, signal);
        await rejected;
        const logs = warn.mock.calls.map(([message]) => String(message));
        expect(logs.map((message) => JSON.parse(message))).toContainEqual(
          expect.objectContaining({
            event: 'efatura.worker.failed',
            requestId: 'test-reference',
            reason: 'incomplete',
            stage: 'extraction',
            exitCode: code,
            signal,
            stderrCode,
            receivedResult: false,
          }),
        );
        expect(logs.join('')).not.toMatch(
          /temporary-secret|123456789|private invoice/,
        );
        expect(invoices.upload).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    },
  );
  it('returns a specific unavailable error when worker assets are missing', async () => {
    const { service, invoices } = fixture();
    (existsSync as jest.Mock).mockReturnValue(false);
    await expect(
      service.fetch(
        { bankImportId: 'import-1', nif: '123456789', password: 'secret' },
        user,
      ),
    ).rejects.toThrow('O serviço de consulta ao e-Fatura não está instalado.');
    expect(fork).not.toHaveBeenCalled();
    expect(invoices.upload).not.toHaveBeenCalled();
  });
  it('reports date filter failure without blaming credentials', async () => {
    const { service, worker, invoices } = fixture();
    const pending = service.fetch(
      { bankImportId: 'import-1', nif: '123456789', password: 'secret' },
      user,
    );
    const rejected = expect(pending).rejects.toThrow('filtros de datas');
    await new Promise(setImmediate);
    worker.emit('message', {
      error: 'CONSULTATION_FAILED',
      stage: 'filters',
      failureCode: 'FILTER_SUBMIT_NOT_FOUND',
    });
    worker.emit('exit', 1);
    await rejected;
    expect(invoices.upload).not.toHaveBeenCalled();
  });
  it('uses the included source worker when the first resolved asset is absent', async () => {
    const { service, worker } = fixture();
    (existsSync as jest.Mock).mockImplementation((path: string) => {
      const normalized = path.replaceAll('\\', '/');
      return (
        !normalized.includes('/efatura-runtime/') &&
        normalized.endsWith('/src/modules/banking/efatura/worker.cjs')
      );
    });
    const pending = service.fetch(
      { bankImportId: 'import-1', nif: '123456789', password: 'secret' },
      user,
    );
    await new Promise(setImmediate);
    expect(fork).toHaveBeenCalledWith(
      expect.stringContaining('src'),
      [],
      expect.any(Object),
    );
    worker.emit('message', { result: { invoices: [] } });
    worker.emit('exit', 0);
    await pending;
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
