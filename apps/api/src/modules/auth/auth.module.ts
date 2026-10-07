import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  PasswordResetDelivery,
  PendingEmailDelivery,
} from './password-reset.delivery';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: PasswordResetDelivery, useClass: PendingEmailDelivery },
  ],
  exports: [AuthService],
})
export class AuthModule {}
