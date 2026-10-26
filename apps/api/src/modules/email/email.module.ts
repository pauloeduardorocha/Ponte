import { Module } from '@nestjs/common';
import { BirdEmailService } from './bird-email.service';

@Module({
  providers: [BirdEmailService],
  exports: [BirdEmailService],
})
export class EmailModule {}
