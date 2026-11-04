import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthRequest } from '../auth/auth.guard';
import { PageQuery } from './member.dto';
import { FamilyDto } from './family.dto';
import { FamilyService } from './family.service';

@ApiTags('Família')
@ApiBearerAuth()
@Controller('member-family')
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

  @Get(':id')
  list(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.family.list(id, req.user);
  }

  @Get(':id/search')
  search(
    @Param('id') id: string,
    @Query() query: PageQuery,
    @Req() req: AuthRequest,
  ) {
    return this.family.search(id, query.search, req.user);
  }

  @Post(':id')
  save(
    @Param('id') id: string,
    @Body() dto: FamilyDto,
    @Req() req: AuthRequest,
  ) {
    return this.family.save(id, dto, req.user);
  }

  @Delete(':id/:linkId')
  @HttpCode(204)
  remove(
    @Param('id') id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Req() req: AuthRequest,
  ) {
    return this.family.remove(id, linkId, req.user);
  }
}
