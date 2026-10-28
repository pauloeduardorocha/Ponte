import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { EfaturaUnavailableException } from '../../common/efatura-unavailable.exception';
import { requestTrace } from '../../common/request-trace';
import type { CurrentUser } from '@church/shared';
import { PrismaService } from '../../database/prisma.service';
import { InvoicesService } from './invoices.service';
import { FetchInvoicesDto } from './invoices.dto';

@Injectable()
export class EfaturaService {
  private readonly logger = new Logger(EfaturaService.name);
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
    const stage = (name: string) => {
      const trace = requestTrace.getStore();
      if (trace) trace.stage = `efatura.${name}`;
    };
    stage('load_import');
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
    stage('load_period');
    const dates = await this.db.bankTransaction.aggregate({
      where: { importId: imported.id },
      _min: { date: true },
      _max: { date: true },
    });
    if (!dates._min.date || !dates._max.date)
      throw new BadRequestException('O extrato não contém movimentos.');
    stage('resolve_worker');
    // Serverless bundling may move this module; includeFiles retains source assets.
    let script: string | undefined;
    try {
      script = require.resolve('./efatura/worker.cjs');
    } catch {
      // Resolve the included source asset when the bundled relative path is absent.
    }
    script = [
      resolve(
        process.cwd(),
        'dist/efatura-runtime/apps/api/src/modules/banking/efatura/worker.cjs',
      ),
      resolve(
        process.cwd(),
        'apps/api/dist/efatura-runtime/apps/api/src/modules/banking/efatura/worker.cjs',
      ),
      resolve(
        __dirname,
        '../../efatura-runtime/apps/api/src/modules/banking/efatura/worker.cjs',
      ),
      script,
      resolve(__dirname, 'efatura/worker.cjs'),
      resolve(process.cwd(), 'src/modules/banking/efatura/worker.cjs'),
      resolve(process.cwd(), 'apps/api/src/modules/banking/efatura/worker.cjs'),
    ].find((path): path is string => Boolean(path && existsSync(path)));
    if (!script) throw new EfaturaUnavailableException('missing');
    if (this.running)
      throw new ConflictException(
        'Uma consulta ao e-Fatura está em andamento. Tente novamente em instantes.',
      );
    this.running = true;
    try {
      stage('consultation');
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
      stage('persist_invoices');
      return await this.invoices.upload(
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
    const trace = requestTrace.getStore();
    return new Promise((resolveResult, reject) => {
      const worker = fork(script, [], {
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        windowsHide: true,
        execArgv: [],
      });
      let result: unknown;
      let consultationError: Error | undefined;
      let settled = false;
      let stderrPrefix = '';
      let workerStage = 'launch';
      // Retain only a bounded prefix in memory; never log stderr itself.
      worker.stderr?.on('data', (chunk: Buffer) => {
        stderrPrefix = (stderrPrefix + chunk.toString()).slice(0, 8192);
      });
      const diagnostic = (
        reason: string,
        code?: number | null,
        signal?: string | null,
      ) => {
        const stderrCode = /\bMODULE_NOT_FOUND\b/.test(stderrPrefix)
          ? 'MODULE_NOT_FOUND'
          : /\bERR_REQUIRE_ESM\b/.test(stderrPrefix)
            ? 'ERR_REQUIRE_ESM'
            : /\bSyntaxError:/.test(stderrPrefix)
              ? 'SYNTAX_ERROR'
              : stderrPrefix
                ? 'UNCLASSIFIED'
                : 'NONE';
        this.logger.warn(
          JSON.stringify({
            event: 'efatura.worker.failed',
            requestId: trace?.requestId,
            stage: workerStage,
            reason,
            exitCode: typeof code === 'number' ? code : null,
            signal: signal && /^SIG[A-Z0-9]+$/.test(signal) ? signal : null,
            stderrCode,
            receivedResult: result !== undefined,
          }),
        );
        stderrPrefix = '';
      };
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          worker.kill();
          reject(error);
        } else resolveResult(result);
      };
      const timer = setTimeout(() => {
        diagnostic('timeout');
        finish(new EfaturaUnavailableException('timeout'));
      }, 120000);
      worker.on('error', () => {
        if (settled) return;
        diagnostic('launch');
        finish(new EfaturaUnavailableException('launch'));
      });
      worker.on(
        'message',
        (message: {
          result?: unknown;
          error?: string;
          stage?: string;
          failureCode?: string;
          field?: string;
          operation?: string;
        }) => {
          if (
            ['launch', 'login', 'filters', 'extraction'].includes(
              message.stage ?? '',
            )
          ) {
            workerStage = message.stage!;
            if (trace) trace.stage = `efatura.${workerStage}`;
          }
          if (message.error) {
            // Never log portal errors, URLs, invoice data or credentials.
            const code =
              message.error === 'BROWSER_UNAVAILABLE'
                ? 'BROWSER_UNAVAILABLE'
                : 'CONSULTATION_FAILED';
            const stage = ['launch', 'login', 'filters', 'extraction'].includes(
              message.stage ?? '',
            )
              ? message.stage
              : 'unknown';
            workerStage = stage ?? 'unknown';
            this.logger.warn(
              JSON.stringify({
                event: 'efatura.consultation.failed',
                requestId: trace?.requestId,
                code,
                stage: workerStage,
                operation: [
                  'portal_login',
                  'apply_filters',
                  'wait_table',
                  'read_headers',
                  'parse_mapping',
                  'validate_headers',
                  'read_rows',
                  'normalize_page',
                  'check_next_page',
                  'capture_pagination',
                  'advance_page',
                  'wait_next_page',
                  'normalize_result',
                  'send_result',
                ].includes(message.operation ?? '')
                  ? message.operation
                  : 'unknown',
                failureCode: [
                  'FILTER_SUBMIT_NOT_FOUND',
                  'PORTAL_TIMEOUT',
                  'PORTAL_ERROR',
                  'PORTAL_RATE_LIMITED',
                  'PORTAL_HTTP_ERROR',
                  'INVOICE_COLUMN_UNKNOWN',
                  'INVOICE_DATE_INVALID',
                  'INVOICE_AMOUNT_INVALID',
                  'INVOICE_LINK_AMBIGUOUS',
                  'INVOICE_IDENTITY_INVALID',
                  'INVOICE_MAPPING_INVALID',
                  'INVOICE_OUTSIDE_PERIOD',
                  'INVOICE_PAGE_REPEATED',
                  'INVOICE_LIMIT_EXCEEDED',
                ].includes(message.failureCode ?? '')
                  ? message.failureCode
                  : 'UNKNOWN',
                field: [
                  'issuerName',
                  'issuerTaxId',
                  'number',
                  'date',
                  'amount',
                  'documentUrl',
                ].includes(message.field ?? '')
                  ? message.field
                  : undefined,
              }),
            );
            if (trace) trace.stage = `efatura.${stage}`;
            consultationError = new EfaturaUnavailableException(
              message.error === 'BROWSER_UNAVAILABLE'
                ? 'browser'
                : message.failureCode === 'PORTAL_RATE_LIMITED'
                  ? 'rate_limit'
                  : message.failureCode === 'PORTAL_HTTP_ERROR'
                    ? 'portal_response'
                    : workerStage === 'filters'
                      ? 'filters'
                      : workerStage === 'extraction'
                        ? 'extraction'
                        : 'portal',
            );
          } else if (message.result) result = message.result;
        },
      );
      worker.on('exit', (code, signal) => {
        if (settled) return;
        if (consultationError || code !== 0 || !result) {
          diagnostic(
            consultationError ? 'consultation' : 'incomplete',
            code,
            signal,
          );
        }
        finish(
          consultationError ??
            (code === 0 && result
              ? undefined
              : new EfaturaUnavailableException('incomplete')),
        );
      });
      // Credentials travel only over the private IPC channel, never as CLI arguments or files.
      worker.send(config, (error) => {
        config = {};
        if (error) finish(new EfaturaUnavailableException('launch'));
      });
    });
  }
}
