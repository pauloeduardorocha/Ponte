import { ApiTags, ApiBearerAuth, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Controller,
  NotFoundException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Permission } from '../auth/permission.decorator';
import { PrismaService } from '../../database/prisma.service';
import { PageQuery } from '../members/member.dto';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
class AuditQuery extends PageQuery {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;
  @ApiPropertyOptional({ type: String, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;
  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entity?: string;
  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  start?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  end?: string;
}
@ApiTags('Auditoria')
@ApiBearerAuth()
@Controller('audit')
@Permission(
  'AUDIT_READ',
  'OPERATION_SCOPE_ALL',
  'FOLLOWUP_READ',
  'SMALL_GROUP_READ',
  'MINISTRY_READ',
  'SCHEDULE_READ',
  'ATTENDANCE_READ',
  'NOTIFICATION_READ',
  'MEMBER_READ',
  'USER_READ',
  'FINANCE_CONTRIBUTION_READ',
  'FINANCE_INVOICE_READ',
  'LIBRARY_HISTORY_READ',
  'VISITOR_READ',
  'EVENT_READ',
)
export class AuditController {
  constructor(private readonly db: PrismaService) {}
  @Get()
  async list(@Query() q: AuditQuery) {
    const where = {
      userId: q.userId,
      action: q.action,
      entity: q.entity,
      entityId: q.entityId,
      createdAt: {
        gte: q.start ? new Date(q.start) : undefined,
        lte: q.end ? new Date(q.end) : undefined,
      },
    };
    return {
      items: await this.db.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      total: await this.db.auditLog.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const record = await this.db.auditLog.findUnique({ where: { id } });
    if (!record) throw new NotFoundException();
    return record;
  }
}
