import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  IsNumber,
  IsOptional,
  Matches,
} from 'class-validator';
export class ManagerDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() userId!: string;
}
export class TicketDto {
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(160) name!: string;
  @ApiProperty({ minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999)
  price!: number;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(1000000) capacity!: number;
  @ApiProperty({ format: 'date-time' }) @IsDateString() startsAt!: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString() endsAt!: string;
}
export class CouponDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  @MaxLength(60)
  code!: string;
  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  discountPercent!: number;
}
export class RefundDto {
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(2000) reason!: string;
}
export class CheckinDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() qrToken!: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
export class SessionDto {
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(160) name!: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString() startsAt!: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString() endsAt!: string;
}
export class EventMessageDto {
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(200) subject!: string;
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(5000) content!: string;
}
export class EventPaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty() registrationId!: string;
  @ApiProperty() amount!: string;
  @ApiProperty() discount!: string;
  @ApiProperty() gatewayFee!: string;
  @ApiProperty() refundedAmount!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() status!: string;
}
export class EventPaymentPageDto {
  @ApiProperty({ type: [EventPaymentDto] }) items!: EventPaymentDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class EventSignupDto {
  @IsOptional() @IsUUID() memberId?: string;
  @IsOptional() @IsUUID() visitorId?: string;
  @IsOptional() @IsUUID() ticketId?: string;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(120) name?: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @Matches(/^[+0-9 ()-]{6,32}$/) phone?: string;
  @IsOptional() @IsBoolean() communicationConsent?: boolean;
}
