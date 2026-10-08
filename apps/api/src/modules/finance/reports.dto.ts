import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
export const REPORTS = [
  'incomes',
  'expenses',
  'cash-flow',
  'account-balances',
  'income-categories',
  'expense-categories',
  'tithes',
  'offerings',
  'donations',
  'member-contributions',
  'supplier-expenses',
  'unreconciled',
  'monthly-evolution',
  'contribution-statement',
] as const;
export type ReportKind = (typeof REPORTS)[number];
export class ReportQuery {
  @IsIn(REPORTS) report!: ReportKind;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  start!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) end!: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() memberId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() @MaxLength(120) costCenter?: string;
  @IsOptional() @IsIn(['PENDING', 'COMPLETED', 'CANCELLED']) status?:
    'PENDING' | 'COMPLETED' | 'CANCELLED';
  @IsOptional()
  @IsIn(['PENDING_REVIEW', 'CLASSIFIED', 'REJECTED', 'POSSIBLE_DUPLICATE'])
  bankStatus?:
    'PENDING_REVIEW' | 'CLASSIFIED' | 'REJECTED' | 'POSSIBLE_DUPLICATE';
  @IsOptional()
  @IsIn(['TITHE', 'OFFERING', 'DONATION', 'OTHER'])
  contributionType?: 'TITHE' | 'OFFERING' | 'DONATION' | 'OTHER';
  @IsOptional() @IsString() @MaxLength(200) churchName?: string;
  @IsOptional() @IsString() @MaxLength(80) churchTaxId?: string;
  @IsOptional() @IsString() @MaxLength(300) churchAddress?: string;
  @IsOptional() @IsString() @MaxLength(2000) observations?: string;
}
export class ReportExportQuery extends ReportQuery {
  @IsIn(['csv', 'xlsx', 'pdf']) format!: 'csv' | 'xlsx' | 'pdf';
}
export class ReportLookupQuery {
  @IsIn(['accounts', 'categories', 'members', 'suppliers']) kind!:
    'accounts' | 'categories' | 'members' | 'suppliers';
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}
