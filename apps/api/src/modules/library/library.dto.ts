import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
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

export const COPY_STATUSES = [
  'AVAILABLE',
  'LOANED',
  'RESERVED',
  'MAINTENANCE',
  'LOST',
  'DISPOSED',
] as const;

export class BookQuery extends PageQuery {
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

export class LibraryQuery extends PageQuery {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsUUID()
  bookId?: string;
}

export class BookDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(200)
  author!: string;

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
  @IsIn(['AVAILABLE', 'MAINTENANCE', 'LOST', 'DISPOSED'])
  status?: 'AVAILABLE' | 'MAINTENANCE' | 'LOST' | 'DISPOSED';

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

export class CopyQuery extends PageQuery {
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
