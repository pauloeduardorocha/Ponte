import { Module } from '@nestjs/common';
import { BankingController } from './banking.controller';
import { BankingService } from './banking.service';
import { StatementParserRegistry } from './statement.parsers';
import { StorageService } from '../finance/storage.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { EfaturaService } from './efatura.service';
@Module({
  controllers: [BankingController, InvoicesController],
  providers: [
    BankingService,
    InvoicesService,
    EfaturaService,
    StorageService,
    {
      provide: StatementParserRegistry,
      useFactory: () => new StatementParserRegistry(),
    },
  ],
})
export class BankingModule {}
