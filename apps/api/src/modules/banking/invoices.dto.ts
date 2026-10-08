import {
  IsIn,
  IsOptional,
  IsUUID,
  IsString,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { FinanceQuery } from '../finance/finance.dto';
export class InvoiceQuery extends FinanceQuery {
  @IsOptional() @IsIn(['true', 'false']) unassociated?: string;
}
export class InvoiceAssociationDto {
  @IsUUID() transactionId!: string;
}
export class FetchInvoicesDto {
  @IsUUID() bankImportId!: string;
  @IsString() @Matches(/^\d{9}$/) nif!: string;
  @IsString() @MinLength(1) @MaxLength(256) password!: string;
}
