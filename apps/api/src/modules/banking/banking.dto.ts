import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { FinanceQuery } from '../finance/finance.dto';
export class ImportUploadDto {
  @IsUUID() accountId!: string;
}
export class BankQuery extends FinanceQuery {
  @IsOptional() @IsIn(['CREDIT', 'DEBIT']) direction?: 'CREDIT' | 'DEBIT';
  @IsOptional() @IsUUID() transactionId?: string;
  @IsOptional() @IsUUID() importId?: string;
  @IsOptional()
  @IsIn([
    'PENDING_REVIEW',
    'CLASSIFIED',
    'RECONCILED',
    'REJECTED',
    'POSSIBLE_DUPLICATE',
  ])
  transactionStatus?:
    | 'PENDING_REVIEW'
    | 'CLASSIFIED'
    | 'RECONCILED'
    | 'REJECTED'
    | 'POSSIBLE_DUPLICATE';
  @IsOptional() @IsIn(['true', 'false']) unreconciled?: string;
}
export class BankIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}
export class ClassifyBankDto extends BankIdsDto {
  @IsIn(['INCOME', 'EXPENSE', 'IGNORE']) classification!:
    'INCOME' | 'EXPENSE' | 'IGNORE';
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() memberId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional()
  @IsIn(['TITHE', 'OFFERING', 'DONATION', 'OTHER'])
  contributionType?: 'TITHE' | 'OFFERING' | 'DONATION' | 'OTHER';
  @IsOptional() @IsBoolean() acceptDuplicate?: boolean;
}
export class ReconcileBankDto extends BankIdsDto {
  @IsOptional() @IsUUID() incomeId?: string;
  @IsOptional() @IsUUID() expenseId?: string;
}
export class LinkBankDto {
  @IsOptional() @IsUUID() incomeId?: string;
  @IsOptional() @IsUUID() expenseId?: string;
}
export class UndoBankDto extends BankIdsDto {
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
