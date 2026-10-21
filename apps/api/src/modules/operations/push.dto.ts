import { Type } from 'class-transformer';
import {
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
  IsDefined,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PushEndpointDto {
  @ApiProperty({
    description: 'Endpoint HTTPS emitido por um serviço Web Push suportado.',
  })
  @IsString()
  @MaxLength(2048)
  endpoint!: string;
}
export class PushKeysDto {
  @ApiProperty()
  @Matches(/^[A-Za-z0-9_-]{87}$/)
  p256dh!: string;
  @ApiProperty()
  @Matches(/^[A-Za-z0-9_-]{22}$/)
  auth!: string;
}
export class PushSubscriptionDto extends PushEndpointDto {
  @ApiProperty({ type: PushKeysDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

export class PushConfigDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: String, nullable: true }) publicKey!: string | null;
}
export class PushStatusDto {
  @ApiProperty() subscribed!: boolean;
}
export class NotificationCountDto {
  @ApiProperty({ minimum: 0 }) count!: number;
}
