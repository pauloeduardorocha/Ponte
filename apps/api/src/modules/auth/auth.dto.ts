import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiProperty({ required: false, default: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  pushReimbursementRequested?: boolean;

  @ApiProperty({
    enum: ['system', 'light', 'dark'],
    required: false,
    default: 'system',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['system', 'light', 'dark'])
  colorMode?: 'system' | 'light' | 'dark';

  @ApiProperty({ required: false, default: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  pushEventRefundRequested?: boolean;

  @ApiProperty({ required: false, default: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  pushLibraryOverdue?: boolean;

  @ApiProperty({ required: false, default: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  pushLibraryReservationReady?: boolean;
}

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class RegisterDto extends LoginDto {
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  declare password: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}

export class ForgotPasswordDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}
