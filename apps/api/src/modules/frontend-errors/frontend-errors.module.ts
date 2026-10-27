import { EmailModule } from '../email/email.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FrontendErrorsController } from './frontend-errors.controller';
import { FrontendErrorsService } from './frontend-errors.service';

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [FrontendErrorsController],
  providers: [FrontendErrorsService],
})
export class FrontendErrorsModule {}
