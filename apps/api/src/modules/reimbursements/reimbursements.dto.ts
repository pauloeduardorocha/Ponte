import { Transform, Type } from 'class-transformer';
import {
  IsIBAN,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  IsInt,
  Min,
  Max,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../members/member.dto';

export class ReimbursementDto {
  @IsOptional() @IsString() @MaxLength(120) beneficiaryName?: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s/g, '').toUpperCase() : value,
  )
  @IsIBAN()
  iban!: string;
  @IsUUID() categoryId!: string;
  @IsOptional() @IsString() @MaxLength(2000) purpose?: string;
  // Positive decimal, up to ten integer digits and two decimal places.
  // Equivalent without lookahead, also understood by OpenAPI tooling using RE2.
  @Matches(/^(?:[1-9]\d{0,9}(?:\.\d{1,2})?|0\.(?:[1-9]\d?|\d[1-9]))$/)
  amount!: string;
}
export class ReimbursementQuery extends PageQuery {
  @IsOptional()
  @IsIn(['INCOMPLETE', 'READY', 'PAID', 'LINKED'])
  status?: string;
}

export class ReimbursementUploadFileDto {
  @IsString() @MaxLength(255) name!: string;
  @IsIn(['application/pdf', 'image/jpeg', 'image/png']) type!: string;
  @IsInt() @Min(1) @Max(2 * 1024 * 1024) size!: number;
  @Matches(/^[a-f0-9]{64}$/) sha256!: string;
}

export class ReimbursementSubmissionDto extends ReimbursementDto {
  @IsUUID() id!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ReimbursementUploadFileDto)
  files!: ReimbursementUploadFileDto[];
}
export class PaymentDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  paidAt!: string;
}
export class LinkReimbursementDto {
  @IsUUID() transactionId!: string;
}
export class ReimbursementFileDto {
  @IsOptional() @IsIn(['DOCUMENT', 'PAYMENT']) kind?: 'DOCUMENT' | 'PAYMENT';
}
