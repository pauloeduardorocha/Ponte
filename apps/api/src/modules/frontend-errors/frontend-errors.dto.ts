import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class ClientDeviceDto {
  @IsOptional() @IsString() @MaxLength(32) @Matches(/^\d+\.\d+\.\d+$/) appVersion?: string;
  @IsOptional() @IsString() @MaxLength(80) os?: string;
  @IsOptional() @IsString() @MaxLength(80) browser?: string;
  @IsOptional() @IsString() @MaxLength(40) platform?: string;
  @IsOptional() @IsString() @MaxLength(80) language?: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) viewportWidth?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) viewportHeight?: number;
  @IsOptional() @IsBoolean() online?: boolean;
  @IsOptional() @IsBoolean() standalone?: boolean;
}

export class ClientLogDto {
  @IsIn(['warn', 'error']) level!: 'warn' | 'error';
  @IsOptional() @IsISO8601() at?: string;
  @IsString() @MaxLength(500) message!: string;
}

export class CreateFrontendErrorDto {
  @IsISO8601() occurredAt!: string;
  @IsIn(['runtime', 'unhandled_rejection', 'console', 'api']) eventType!: string;
  @IsString() @MaxLength(2000) message!: string;
  @IsOptional() @IsString() @MaxLength(8000) stack?: string;
  @IsString() @MaxLength(512) route!: string;
  @IsOptional() @IsString() @MaxLength(128) clientRequestId?: string;
  @IsOptional() @IsString() @MaxLength(512) apiPath?: string;
  @IsOptional() @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) apiMethod?: string;
  @IsOptional() @IsInt() @Min(0) @Max(599) apiStatus?: number;
  @IsOptional() @IsString() @MaxLength(1024) userAgent?: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ClientDeviceDto) device?: ClientDeviceDto;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ClientLogDto) logs?: ClientLogDto[];
}
