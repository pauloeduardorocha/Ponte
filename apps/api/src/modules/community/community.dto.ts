import { PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PageQuery } from '../members/member.dto';
export class CommunityQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(20) status?: string;
}
export class VisitorDto {
  @IsString() @Matches(/\S/) @MaxLength(120) name!: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string | null;
  @IsOptional() @IsString() @MaxLength(32) phone?: string | null;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  visitedAt!: string;
  @IsOptional() @IsIn(['NEW', 'CONTACTED', 'ARCHIVED']) status?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
}
export class VisitorPatch extends PartialType(VisitorDto, {
  skipNullProperties: false,
}) {}
export class EventDto {
  @IsString() @Matches(/\S/) @MaxLength(160) name!: string;
  @IsDateString({ strict: true }) startsAt!: string;
  @IsString() @Matches(/\S/) @MaxLength(200) location!: string;
  @IsOptional() @IsIn(['SCHEDULED', 'COMPLETED', 'CANCELLED']) status?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
}
export class EventPatch extends PartialType(EventDto, {
  skipNullProperties: false,
}) {}
