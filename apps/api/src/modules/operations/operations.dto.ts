import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PageQuery } from '../members/member.dto';
export class OperationQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(30) status?: string;
  @IsOptional() @IsUUID() memberId?: string;
  @IsOptional() @IsUUID() visitorId?: string;
  @IsOptional() @IsUUID() leaderMemberId?: string;
  @IsOptional() @IsUUID() assignedToUserId?: string;
  @IsOptional() @IsUUID() eventId?: string;
  @IsOptional() @IsUUID() smallGroupId?: string;
  @IsOptional() @IsUUID() ministryId?: string;
  @IsOptional() @IsDateString({ strict: true }) start?: string;
  @IsOptional() @IsDateString({ strict: true }) end?: string;
  @IsOptional() @IsIn(['true', 'false']) active?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  meetingDay?: number;
}
export class OperationalVisitorDto {
  @IsString() @Matches(/\S/) @MaxLength(60) firstName!: string;
  @IsOptional() @IsString() @MaxLength(59) lastName?: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string | null;
  @IsOptional() @IsString() @MaxLength(32) phone?: string | null;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  birthDate?: string | null;
  @IsOptional()
  @IsIn(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'])
  gender?: string | null;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  firstVisitDate!: string;
  @IsOptional() @IsString() @MaxLength(200) howDidYouHear?: string | null;
  @IsOptional() @IsUUID() invitedByMemberId?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional()
  @IsIn([
    'NEW',
    'CONTACTED',
    'IN_FOLLOW_UP',
    'INTEGRATING',
    'INTEGRATED',
    'INACTIVE',
    'ARCHIVED',
  ])
  status?: string;
}
export class OperationalVisitorPatch extends PartialType(
  OperationalVisitorDto,
) {}
export class ConvertVisitorDto {
  @IsOptional() @IsUUID() memberId?: string;
}
export class FollowUpDto {
  @IsOptional() @IsUUID() visitorId?: string;
  @IsOptional() @IsUUID() memberId?: string;
  @IsUUID() assignedToUserId!: string;
  @IsOptional()
  @IsIn(['PENDING', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'])
  status?: string;
  @IsOptional() @IsDateString({ strict: true }) startedAt?: string;
  @IsOptional() @IsDateString({ strict: true }) nextContactAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class FollowUpPatch extends PartialType(FollowUpDto) {}
export class InteractionDto {
  @IsIn(['PHONE', 'WHATSAPP', 'EMAIL', 'IN_PERSON', 'OTHER']) type!: string;
  @IsDateString({ strict: true }) interactionDate!: string;
  @IsString() @Matches(/\S/) @MaxLength(2000) notes!: string;
  @IsOptional() @IsDateString({ strict: true }) nextActionAt?: string;
}
export class SmallGroupDto {
  @IsString() @Matches(/\S/) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsUUID() leaderMemberId!: string;
  @IsOptional() @IsUUID() coLeaderMemberId?: string;
  @IsOptional() @IsUUID() hostMemberId?: string;
  @IsString() @Matches(/\S/) @MaxLength(200) address!: string;
  @IsInt() @Min(0) @Max(6) meetingDay!: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) meetingTime!: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
}
export class SmallGroupPatch extends PartialType(SmallGroupDto) {}
export class MinistryDto {
  @IsString() @Matches(/\S/) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsUUID() leaderMemberId!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class MinistryPatch extends PartialType(MinistryDto) {}
export class ParticipantDto {
  @IsUUID() memberId!: string;
  @IsOptional() @IsIn(['LEADER', 'CO_LEADER', 'HOST', 'MEMBER']) role?: string;
}
export class OperationalEventDto {
  @IsString() @Matches(/\S/) @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsIn([
    'SERVICE',
    'CONFERENCE',
    'MEETING',
    'TRAINING',
    'SMALL_GROUP',
    'MINISTRY',
    'SPECIAL',
    'OTHER',
  ])
  type!: string;
  @IsString() @Matches(/\S/) @MaxLength(200) location!: string;
  @IsDateString({ strict: true }) startDateTime!: string;
  @IsDateString({ strict: true }) endDateTime!: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsBoolean() registrationRequired?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsUUID() ministryId?: string;
  @IsOptional() @IsUUID() smallGroupId?: string;
  @IsOptional() @IsIn(['SCHEDULED', 'COMPLETED', 'CANCELLED']) status?: string;
}
export class OperationalEventPatch extends PartialType(OperationalEventDto) {}
export class PersonDto {
  @IsOptional() @IsUUID() memberId?: string;
  @IsOptional() @IsUUID() visitorId?: string;
}
export class ScheduleDto {
  @IsUUID() eventId!: string;
  @IsOptional() @IsUUID() ministryId?: string;
  @IsString() @Matches(/\S/) @MaxLength(160) title!: string;
  @IsDateString({ strict: true }) date!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'])
  status?: string;
}
export class SchedulePatch extends PartialType(ScheduleDto) {}
export class AssignmentDto {
  @IsUUID() memberId!: string;
  @IsOptional() @IsUUID() ministryId?: string;
  @IsString() @Matches(/\S/) @MaxLength(120) function!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class AssignmentStatusDto {
  @IsIn(['CONFIRMED', 'DECLINED', 'COMPLETED', 'ABSENT']) status!: string;
}
export class AssignmentResponseDto {
  @IsIn(['CONFIRMED', 'DECLINED'])
  status!: string;
}
export class AttendanceDto extends PersonDto {
  @IsOptional() @IsUUID() eventId?: string;
  @IsOptional() @IsUUID() smallGroupId?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  attendanceDate!: string;
  @IsIn(['PRESENT', 'ABSENT', 'EXCUSED']) status!: string;
}
export class AttendancePatch {
  @IsIn(['PRESENT', 'ABSENT', 'EXCUSED']) status!: string;
}
export class NotificationDto {
  @IsOptional() @IsUUID() recipientMemberId?: string;
  @IsOptional() @IsUUID() recipientVisitorId?: string;
  @IsIn(['EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'INTERNAL']) channel!: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsString() @Matches(/\S/) @MaxLength(5000) content!: string;
  @IsOptional() @IsDateString({ strict: true }) scheduledAt?: string;
}
export class TemplateDto {
  @IsString() @Matches(/\S/) @MaxLength(120) name!: string;
  @IsIn(['EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'INTERNAL']) channel!: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsString() @Matches(/\S/) @MaxLength(5000) content!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class TemplatePatch extends PartialType(TemplateDto) {}
