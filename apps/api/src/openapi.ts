import type { INestApplication } from '@nestjs/common';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  PERMISSION_ANY_KEY,
  PERMISSION_KEY,
  PUBLIC_KEY,
} from './modules/auth/permission.decorator';

export const API_PREFIX = 'api/v1';

/** Shared by the development Swagger UI and the versioned contract exporter. */
export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Ponte API')
    .setDescription('API para gestão da igreja')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token', undefined, 'refresh_token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const operations = new Map(
    Object.values(document.paths).flatMap((path) =>
      Object.values(path ?? {})
        .filter(
          (operation) =>
            operation &&
            typeof operation === 'object' &&
            'operationId' in operation,
        )
        .map((operation) => [operation.operationId, operation] as const),
    ),
  );
  const reflector = new Reflector();
  const scanner = new MetadataScanner();
  for (const module of app.get(ModulesContainer).values()) {
    for (const controller of module.controllers.values()) {
      const type = controller.metatype;
      if (!type?.prototype) continue;
      for (const method of scanner.getAllMethodNames(type.prototype)) {
        const operation = operations.get(`${type.name}_${method}`);
        if (!operation) continue; // Non-routes and explicitly excluded controllers.
        const targets = [type.prototype[method], type];
        const isPublic = reflector.getAllAndOverride<boolean>(
          PUBLIC_KEY,
          targets,
        );
        // Public cookie endpoints still require their declared refresh cookie.
        operation.security = isPublic
          ? (operation.security ?? []).filter(
              (security) => !('bearer' in security),
            )
          : operation.security?.length
            ? operation.security
            : [{ bearer: [] }];
        for (const [key, extension] of [
          [PERMISSION_KEY, 'x-permissions-all'],
          [PERMISSION_ANY_KEY, 'x-permissions-any'],
        ] as const) {
          const permissions = reflector.getAllAndOverride<string[]>(
            key,
            targets,
          );
          if (permissions?.length)
            Object.assign(operation, { [extension]: permissions });
        }
      }
    }
  }
  return Object.assign(document, { 'x-ponte-generator': 1 });
}
