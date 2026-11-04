import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';

@Module({
  controllers: [MembersController, FamilyController],
  providers: [MembersService, FamilyService],
})
export class MembersModule {}
