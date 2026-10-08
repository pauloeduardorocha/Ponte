import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CurrentUser } from '@church/shared';
import { PrismaService } from '../../database/prisma.service';
import { InvoicesService } from './invoices.service';
import { FetchInvoicesDto } from './invoices.dto';

@Injectable()
export class EfaturaService {
  private running = false;
  constructor(
    private readonly db: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  async fetch(dto: FetchInvoicesDto, user: CurrentUser) {
    if (this.running)
      throw new ConflictException(
        'Uma consulta ao e-Fatura está em andamento. Tente novamente em instantes.',
      );
    const imported = await this.db.bankImport.findUnique({
      where: { id: dto.bankImportId },
    });
    if (!imported) throw new NotFoundException();
    if (
      imported.status !== 'CONFIRMED' &&
      imported.status !== 'READY_FOR_REVIEW'
    ) {
      throw new BadRequestException('Escolha um extrato processado.');
    }
    const dates = await this.db.bankTransaction.aggregate({
      where: { importId: imported.id },
      _min: { date: true },
      _max: { date: true },
    });
    if (!dates._min.date || !dates._max.date)
      throw new BadRequestException('O extrato não contém movimentos.');
    const script = [
      resolve(process.cwd(), '../scrapper/teste.js'),
      resolve(process.cwd(), 'apps/scrapper/teste.js'),
    ].find(existsSync);
    if (!script)
      throw new ServiceUnavailableException(
        'O serviço de consulta ao e-Fatura não está instalado.',
      );
    if (this.running)
      throw new ConflictException(
        'Uma consulta ao e-Fatura está em andamento. Tente novamente em instantes.',
      );
    this.running = true;
    try {
      const consultation = this.run(script, {
        nif: dto.nif,
        password: dto.password,
        bankImportId: imported.id,
        period: {
          start: dates._min.date.toISOString().slice(0, 10),
          end: dates._max.date.toISOString().slice(0, 10),
        },
      });
      dto.password = '';
      const result = await consultation;
      const buffer = Buffer.from(JSON.stringify(result));
      if (buffer.length > 10 * 1024 * 1024)
        throw new BadRequestException(
          'Há demasiadas faturas. Use um extrato com período menor.',
        );
      return this.invoices.upload(
        {
          originalname: 'faturas-efatura.json',
          mimetype: 'application/json',
          size: buffer.length,
          buffer,
        },
        user,
      );
    } finally {
      dto.password = '';
      this.running = false;
    }
  }

  private run(script: string, config: object): Promise<unknown> {
    return new Promise((resolveResult, reject) => {
      const worker = fork(script, [], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        windowsHide: true,
        execArgv: [],
      });
      let result: unknown;
      let consultationError: Error | undefined;
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          worker.kill();
          reject(error);
        } else resolveResult(result);
      };
      const timer = setTimeout(
        () =>
          finish(
            new ServiceUnavailableException(
              'A consulta demorou demasiado. Tente novamente. O extrato já foi importado.',
            ),
          ),
        120000,
      );
      worker.on('error', () =>
        finish(
          new ServiceUnavailableException(
            'Não foi possível iniciar a consulta ao e-Fatura.',
          ),
        ),
      );
      worker.on('message', (message: { result?: unknown; error?: string }) => {
        if (message.error)
          consultationError = new ServiceUnavailableException(
            message.error === 'BROWSER_UNAVAILABLE'
              ? 'O navegador de consulta não está disponível. Verifique a instalação do serviço.'
              : 'Não foi possível consultar as faturas. Confira o NIF e a senha. O portal pode exigir MFA ou CAPTCHA.',
          );
        else if (message.result) result = message.result;
      });
      worker.on('exit', (code) =>
        finish(
          consultationError ??
            (code === 0 && result
              ? undefined
              : new ServiceUnavailableException(
                  'A consulta ao e-Fatura não foi concluída.',
                )),
        ),
      );
      // Credentials travel only over the private IPC channel, never as CLI arguments or files.
      worker.send(config, (error) => {
        config = {};
        if (error)
          finish(
            new ServiceUnavailableException(
              'Não foi possível iniciar a consulta.',
            ),
          );
      });
    });
  }
}
