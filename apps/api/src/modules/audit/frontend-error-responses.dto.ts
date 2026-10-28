import { ApiProperty } from '@nestjs/swagger';
import type {
  FrontendErrorDetail,
  FrontendErrorDevice,
  FrontendErrorStat,
  FrontendErrorStats,
  FrontendErrorSummary,
  JsonValue,
  Page,
} from '@church/shared';

export class FrontendErrorSummaryDto implements FrontendErrorSummary {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty() eventType!: string;
  @ApiProperty() message!: string;
  @ApiProperty() route!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) userId!:
    string | null;
  @ApiProperty({ type: Number, nullable: true }) apiStatus!: number | null;
  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    properties: { appVersion: { type: 'string' } },
  })
  device!: FrontendErrorDevice | null;
}

export class FrontendErrorPageDto implements Page<FrontendErrorSummary> {
  @ApiProperty({ type: [FrontendErrorSummaryDto] })
  items!: FrontendErrorSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class FrontendErrorDetailDto
  extends FrontendErrorSummaryDto
  implements FrontendErrorDetail
{
  @ApiProperty({ format: 'uuid' }) requestId!: string;
  @ApiProperty({ type: String, nullable: true }) clientRequestId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) stack!: string | null;
  @ApiProperty({ type: String, nullable: true }) apiPath!: string | null;
  @ApiProperty({ type: String, nullable: true }) apiMethod!: string | null;
  @ApiProperty({ type: String, nullable: true }) userAgent!: string | null;
  @ApiProperty({
    nullable: true,
    oneOf: [
      { type: 'array', items: { type: 'object', additionalProperties: true } },
      { type: 'object', additionalProperties: true },
    ],
  })
  logs!: JsonValue;
}

export class FrontendErrorStatDto implements FrontendErrorStat {
  @ApiProperty() kind!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: 'integer', minimum: 0 }) count!: number;
}

export class FrontendErrorStatsDto implements FrontendErrorStats {
  @ApiProperty({ type: [FrontendErrorStatDto] }) rows!: FrontendErrorStatDto[];
}
