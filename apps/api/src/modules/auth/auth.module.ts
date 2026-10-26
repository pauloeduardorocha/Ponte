import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasskeysService } from './passkeys.service';
import { PasskeysController } from './passkeys.controller';
import {
  PasswordResetDelivery,
  BirdPasswordResetDelivery,
} from './password-reset.delivery';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [JwtModule.register({}), EmailModule],
  controllers: [AuthController, PasskeysController],
  providers: [
    AuthService,
    PasskeysService,
    { provide: PasswordResetDelivery, useClass: BirdPasswordResetDelivery },
  ],
  exports: [AuthService],
})
export class AuthModule {}
