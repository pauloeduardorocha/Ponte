import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permission } from '../auth/permission.decorator';
import { CreateMemberDto, MemberQuery, UpdateMemberDto } from './member.dto';
import { MembersService } from './members.service';

@ApiTags('Membros')
@ApiBearerAuth()
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @Permission('MEMBER_READ')
  list(@Query() query: MemberQuery) {
    return this.members.list(query);
  }

  @Get(':id')
  @Permission('MEMBER_READ')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.members.get(id);
  }

  @Post()
  @Permission('MEMBER_CREATE')
  create(@Body() dto: CreateMemberDto) {
    return this.members.create(dto);
  }

  @Patch(':id')
  @Permission('MEMBER_UPDATE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMemberDto) {
    return this.members.update(id, dto);
  }

  @Delete(':id')
  @Permission('MEMBER_DELETE')
  @HttpCode(204)
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.members.delete(id);
  }
}
