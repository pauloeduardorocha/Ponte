import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { StorageService } from './storage.service';
@Module({
  controllers: [FinanceController, ReportsController],
  providers: [FinanceService, StorageService, ReportsService],
})
export class FinanceModule {}
