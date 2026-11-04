import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class FamilyDto {
  @IsIn(['FATHER', 'MOTHER', 'CHILD', 'SPOUSE'])
  relation!: 'FATHER' | 'MOTHER' | 'CHILD' | 'SPOUSE';

  @ValidateIf((o: FamilyDto) => o.relation === 'CHILD')
  @IsIn(['FATHER', 'MOTHER'])
  parentRole?: 'FATHER' | 'MOTHER';

  @IsOptional()
  @IsUUID()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  memberId?: string;

  @ValidateIf((o: FamilyDto) => !o.memberId)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ValidateIf((o: FamilyDto) => !o.memberId)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  birthDate?: string;

  @IsOptional()
  @IsBoolean()
  createAccount?: boolean;

  @ValidateIf(
    (o: FamilyDto) =>
      !o.memberId && (o.createAccount === true || o.email !== undefined),
  )
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ValidateIf(
    (o: FamilyDto) =>
      !o.memberId && (o.createAccount === true || o.phone !== undefined),
  )
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(32)
  @Matches(/^\+?[\d ()-]+$/)
  @Matches(/^(?:\D*\d){7,15}\D*$/)
  phone?: string;

  @ValidateIf((o: FamilyDto) => !o.memberId && o.createAccount === true)
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password?: string;
}
