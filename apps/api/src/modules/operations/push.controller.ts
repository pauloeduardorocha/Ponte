import { Body, Controller, Delete, Get, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthRequest } from '../auth/auth.guard';
import { PushService } from './push.service';
import {
  PushEndpointDto,
  PushSubscriptionDto,
  PushConfigDto,
  PushStatusDto,
} from './push.dto';

@ApiTags('Notificacoes push')
@ApiBearerAuth()
@Controller('operations/push')
export class PushController {
  constructor(private readonly push: PushService) {}
  @Get('config')
  @ApiOkResponse({ type: PushConfigDto })
  settings() {
    return this.push.settings();
  }
  @Post('subscriptions')
  @ApiCreatedResponse({ type: PushStatusDto })
  @ApiResponse({ status: 400, description: 'Endpoint ou chaves inválidos.' })
  @ApiResponse({
    status: 409,
    description: 'Endpoint de outra conta ou limite de dispositivos.',
  })
  @ApiResponse({ status: 503, description: 'Push não configurado.' })
  subscribe(@Req() request: AuthRequest, @Body() dto: PushSubscriptionDto) {
    return this.push.subscribe(request.user.id, dto);
  }
  @Delete('subscriptions')
  @ApiOkResponse({ type: PushStatusDto })
  unsubscribe(@Req() request: AuthRequest, @Body() dto: PushEndpointDto) {
    return this.push.unsubscribe(request.user.id, dto.endpoint);
  }
}
