import { PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PageQuery } from '../members/member.dto';
export class FinanceQuery extends PageQuery {
  @IsOptional() @IsIn(['TITHE', 'OFFERING', 'DONATION', 'OTHER']) type?:
    'TITHE' | 'OFFERING' | 'DONATION' | 'OTHER';
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  start?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  end?: string;
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsIn(['PENDING', 'COMPLETED', 'CANCELLED']) status?:
    'PENDING' | 'COMPLETED' | 'CANCELLED';
}
export class DashboardQuery {
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
  @IsOptional() @IsUUID() accountId?: string;
}
export class CategoryDto {
  @IsString() @Matches(/\S/) @MaxLength(120) name!: string;
  @IsIn(['INCOME', 'EXPENSE']) kind!: 'INCOME' | 'EXPENSE';
  @IsOptional() @IsUUID() parentId?: string | null;
}
export class CategoryPatch extends PartialType(CategoryDto, {
  skipNullProperties: false,
}) {}
export class AccountDto {
  @IsString() @Matches(/\S/) @MaxLength(120) bank!: string;
  @IsString() @Matches(/\S/) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(40) branch?: string | null;
  @IsOptional() @IsString() @MaxLength(80) account?: string | null;
  @IsOptional() @Matches(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/) iban?:
    string | null;
  @Matches(/^[A-Z]{3}$/) currency!: string;
  @Matches(/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/) openingBalance!: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}
export class AccountPatch extends PartialType(AccountDto, {
  skipNullProperties: false,
}) {}
export class SupplierDto {
  @IsString() @Matches(/\S/) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(40) taxId?: string | null;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string | null;
  @IsOptional() @IsString() @MaxLength(32) phone?: string | null;
}
export class SupplierPatch extends PartialType(SupplierDto, {
  skipNullProperties: false,
}) {}
export class TransactionDto {
  @Matches(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/) amount!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) date!: string;
  @IsUUID() categoryId!: string;
  @IsUUID() accountId!: string;
  @IsString() @Matches(/\S/) @MaxLength(2000) description!: string;
  @IsOptional() @IsString() @MaxLength(120) costCenter?: string | null;
  @IsOptional() @IsIn(['PENDING', 'COMPLETED', 'CANCELLED']) status?:
    'PENDING' | 'COMPLETED' | 'CANCELLED';
}
export class IncomeDto extends TransactionDto {
  @IsString() @Matches(/\S/) @MaxLength(200) origin!: string;
  @IsOptional() @IsUUID() memberId?: string | null;
  @IsOptional() @IsString() @MaxLength(200) reference?: string | null;
  @IsOptional() @IsUUID() bankTransactionId?: string | null;
}
export class IncomePatch extends PartialType(IncomeDto, {
  skipNullProperties: false,
}) {}
export class ExpenseDto extends TransactionDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dueDate!: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  paidAt?: string | null;
  @IsOptional() @IsUUID() supplierId?: string | null;
  @IsOptional() @IsString() @MaxLength(200) document?: string | null;
}
export class ExpensePatch extends PartialType(ExpenseDto, {
  skipNullProperties: false,
}) {}
export class ContributionDto {
  @IsUUID() incomeId!: string;
  @IsUUID() memberId!: string;
  @IsIn(['TITHE', 'OFFERING', 'DONATION', 'OTHER']) type!:
    'TITHE' | 'OFFERING' | 'DONATION' | 'OTHER';
}
export class ContributionPatch extends PartialType(ContributionDto, {
  skipNullProperties: false,
}) {}
