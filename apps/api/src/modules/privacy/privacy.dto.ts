import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class PersonalExportQuery {
  @IsOptional() @IsIn(['true', 'false']) includeFinancial?: string;
}
export class PrivacyRequestDto {
  @IsIn(['EXPORT', 'RECTIFICATION', 'ANONYMIZATION']) kind!:
    'EXPORT' | 'RECTIFICATION' | 'ANONYMIZATION';
  @IsString() @MinLength(12) @MaxLength(2000) details!: string;
}
export class ConsentDto {
  @IsString() @MinLength(3) @MaxLength(120) purpose!: string;
  @IsString() @MinLength(1) @MaxLength(120) policyVersion!: string;
  @IsBoolean() granted!: boolean;
}
export class ResolvePrivacyDto {
  @IsIn(['COMPLETED', 'REJECTED']) status!: 'COMPLETED' | 'REJECTED';
  @IsString() @MinLength(12) @MaxLength(2000) resolution!: string;
}
export class RetentionDto {
  @IsIn([
    'MEMBER_PROFILE',
    'FINANCIAL_RECORD',
    'AUDIT_LOG',
    'BANK_FILE',
    'CONSENT',
  ])
  dataClass!: string;
  @IsInt() @Min(0) @Max(1200) minimumMonths!: number;
  @IsString() @MinLength(12) @MaxLength(2000) legalBasis!: string;
}
export class LegalHoldDto {
  @IsBoolean() legalHold!: boolean;
}
export class AnonymizeDto {
  @IsUUID() requestId!: string;
}
