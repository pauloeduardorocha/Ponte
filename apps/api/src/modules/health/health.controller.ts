import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service';
import { Public } from '../auth/permission.decorator';

@ApiTags('health')
@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({
    schema: {
      example: { status: 'ok', services: { api: 'up', database: 'up' } },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'API disponível, mas o banco de dados não está acessível.',
  })
  async check(@Res({ passthrough: true }) response: Response) {
    const health = await this.healthService.check();
    if (health.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }
}
