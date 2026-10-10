import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/permission.decorator';
import { AuthRequest } from '../auth/auth.guard';
import { EventSignupService } from './event-signup.service';
import { EventSignupDto } from './events.dto';
@Controller('public/events')
export class EventSignupController {
  constructor(private readonly service: EventSignupService) {}
  @Public() @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.publicEvent(id);
  }
  @Get(':id/profile') profile(@Req() req: AuthRequest) {
    return this.service.profile(req.user);
  }
  @Public() @Post(':id/registrations') signup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EventSignupDto,
  ) {
    return this.service.signup(id, dto);
  }
  @Post(':id/member-registrations') member(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EventSignupDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.signup(id, dto, req.user);
  }
  @Public() @Get(':id/payment-status') status(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('sessionId') sessionId: string,
  ) {
    return this.service.status(id, sessionId);
  }
}
@Controller('stripe')
export class StripeWebhookController {
  constructor(private readonly service: EventSignupService) {}
  @Public() @SkipThrottle() @Post('webhook') webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.service.webhook(req.rawBody, signature);
  }
}
