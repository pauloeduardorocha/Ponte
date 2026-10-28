import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIBAN,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class PageQuery {
  @ApiPropertyOptional({
    type: 'integer',
    default: 1,
    minimum: 1,
    maximum: 100000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({
    type: 'integer',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize: number = 20;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;
}

export class MemberQuery extends PageQuery {
  @IsIn(['ACTIVE', 'INACTIVE'])
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiPropertyOptional({
    type: String,
    enum: ['name', 'email', 'phone', 'status', 'createdAt'],
    default: 'name',
  })
  @IsIn(['name', 'email', 'phone', 'status', 'createdAt'])
  @IsOptional()
  sortBy: 'name' | 'email' | 'phone' | 'status' | 'createdAt' = 'name';

  @ApiPropertyOptional({ type: String, enum: ['asc', 'desc'], default: 'asc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'asc';
}

export class CreateMemberDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MaxLength(32)
  @IsOptional()
  phone?: string | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/\s/g, '').toUpperCase() || null
      : value,
  )
  @IsIBAN()
  @IsOptional()
  iban?: string | null;

  @IsIn(['ACTIVE', 'INACTIVE'])
  @ValidateIf((_object, value) => value !== undefined)
  status?: 'ACTIVE' | 'INACTIVE';

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @IsOptional()
  birthDate?: string | null;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string | null;
}

export class UpdateMemberDto extends PartialType(CreateMemberDto, {
  skipNullProperties: false,
}) {}
