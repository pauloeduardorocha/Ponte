import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = Number(config.get<string>('API_PORT') ?? 3000);

  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.enableCors({
    origin:
      config
        .get<string>('CORS_ORIGIN')
        ?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean) ?? false,
    credentials: true,
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (config.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Ponte API')
      .setDescription('API para gestão da igreja')
      .setVersion('0.1.0')
      .addBearerAuth()
      .addCookieAuth('refresh_token', undefined, 'refresh_token')
      .build();
    SwaggerModule.setup(
      'api/v1/docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535');
  }

  await app.listen(port);
}

void bootstrap();
