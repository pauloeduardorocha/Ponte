import { Transform } from 'class-transformer';
import {
  IsIBAN,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
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
  @Matches(/^(?=.*[1-9])(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/) amount!: string;
}
export class ReimbursementQuery extends PageQuery {
  @IsOptional()
  @IsIn(['INCOMPLETE', 'READY', 'PAID', 'LINKED'])
  status?: string;
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
