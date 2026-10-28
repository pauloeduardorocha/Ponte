import { PartialType, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PageQuery } from '../members/member.dto';
import type { BookAvailability } from '@church/shared';

export class BookAvailabilityDto implements BookAvailability {
  @ApiProperty({ format: 'uuid' }) bookId!: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) quantity!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) available!: number;
}

export class LibraryPageQuery extends PageQuery {
  @ApiPropertyOptional({
    type: 'integer',
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  override pageSize: number = 10;
}

export class BookAvailabilityQuery {
  @ApiProperty({
    type: [String],
    description: 'Até 100 IDs de livros separados por vírgula.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}

export const COPY_STATUSES = [
  'PENDING_INVENTORY',
  'AVAILABLE',
  'LOANED',
  'RESERVED',
  'MAINTENANCE',
  'LOST',
  'DISPOSED',
] as const;

export class BookQuery extends LibraryPageQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  available?: string;
}

export class LibraryQuery extends LibraryPageQuery {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsUUID()
  bookId?: string;
}

export class BookDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(32)
  registrationNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  collection?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  catalogueNotes?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2,3}$/)
  primaryCategoryCode?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @Matches(/^\d{2,3}$/, { each: true })
  secondaryCategoryCodes?: string[];

  @IsOptional()
  @IsBoolean()
  classificationReviewed?: boolean;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(200)
  author?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  isbn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  publisher?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  edition?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  year?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(80)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  pages?: number;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  cover?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  keywords?: string[];
}

export class UpdateBookDto extends PartialType(BookDto, {
  skipNullProperties: false,
}) {}

export class CopyDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shelfmark?: string | null;

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(100)
  assetCode!: string;

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(200)
  location!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  qrCode?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(120)
  condition?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  acquiredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class UpdateCopyDto extends PartialType(CopyDto, {
  skipNullProperties: false,
}) {
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['PENDING_INVENTORY', 'AVAILABLE', 'MAINTENANCE', 'LOST', 'DISPOSED'])
  status?:
    'PENDING_INVENTORY' | 'AVAILABLE' | 'MAINTENANCE' | 'LOST' | 'DISPOSED';

  @IsString()
  @Matches(/\S/)
  @MaxLength(2000)
  justification!: string;
}

export class LoanDto {
  @IsUUID()
  memberId!: string;

  @IsUUID()
  bookCopyId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observations?: string;
}

export class ReservationDto {
  @IsUUID()
  memberId!: string;

  @IsUUID()
  bookId!: string;
}

export class SettingsDto {
  @IsInt()
  @Min(1)
  @Max(365)
  defaultLoanDays!: number;

  @IsInt()
  @Min(1)
  @Max(100)
  maxBooks!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  maxRenewals!: number;

  @IsInt()
  @Min(0)
  @Max(365)
  graceDays!: number;

  @Matches(/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/)
  dailyFine!: string;

  @IsBoolean()
  blockOverdue!: boolean;

  @IsInt()
  @Min(1)
  @Max(30)
  holdDays!: number;

  @IsInt()
  @Min(1)
  @Max(365)
  reservationDays!: number;
}

export class PaymentDto {
  @Matches(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/)
  amount!: string;

  @IsUUID()
  idempotencyKey!: string;
}

export class AdjustmentDto {
  @IsIn(['DISCOUNT', 'FORGIVE', 'CANCEL'])
  kind!: 'DISCOUNT' | 'FORGIVE' | 'CANCEL';

  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/)
  amount?: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(2000)
  justification!: string;
}

export class CopyQuery extends LibraryPageQuery {
  @IsOptional()
  @IsIn(COPY_STATUSES)
  status?: (typeof COPY_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  bookId?: string;
}

export class LoanQuery extends LibraryQuery {
  @IsOptional()
  @IsIn(['ACTIVE', 'RETURNED', 'OVERDUE', 'LOST', 'CANCELLED'])
  status?: 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'LOST' | 'CANCELLED';
}

export class CloseLoanDto {
  @IsIn(['LOST', 'CANCELLED'])
  status!: 'LOST' | 'CANCELLED';

  @IsString()
  @Matches(/\S/)
  @MaxLength(2000)
  justification!: string;
}
