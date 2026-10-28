import { Controller, Get, Post, Body } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ApiCookieAuth,
  ApiExcludeController,
  ApiProperty,
} from '@nestjs/swagger';
import { API_PREFIX, createOpenApiDocument } from './openapi';
import {
  Permission,
  PermissionAny,
  Public,
} from './modules/auth/permission.decorator';

class MessageDto {
  @ApiProperty() content!: string;
}
@Controller('contract-test')
@Permission('AUDIT_READ')
class ContractController {
  @Get() list() {
    return [];
  }
  @Public() @Get('public') publicRoute() {
    return {};
  }
  @Public() @ApiCookieAuth('refresh_token') @Post('refresh') refresh() {
    return {};
  }
  @PermissionAny('MEMBER_READ', 'USER_READ')
  @Post()
  create(@Body() dto: MessageDto) {
    return dto;
  }
}
@ApiExcludeController()
@Controller('internal/contract-test')
class HiddenController {
  @Post() process() {
    return {};
  }
}

describe('OpenAPI contract from runtime route metadata', () => {
  it('preserves prefix, request schemas, auth and permission requirements without starting HTTP', async () => {
    const module = await Test.createTestingModule({
      controllers: [ContractController, HiddenController],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    try {
      const doc = createOpenApiDocument(app);
      expect(doc['x-ponte-generator']).toBe(1);
      expect(doc.paths['/api/v1/contract-test']?.get).toMatchObject({
        security: [{ bearer: [] }],
        'x-permissions-all': ['AUDIT_READ'],
      });
      expect(doc.paths['/api/v1/contract-test']?.post).toMatchObject({
        'x-permissions-any': ['MEMBER_READ', 'USER_READ'],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageDto' },
            },
          },
        },
      });
      expect(doc.paths['/api/v1/contract-test/public']?.get?.security).toEqual(
        [],
      );
      expect(
        doc.paths['/api/v1/contract-test/refresh']?.post?.security,
      ).toEqual([{ refresh_token: [] }]);
      expect(doc.paths['/api/v1/internal/contract-test']).toBeUndefined();
      expect(doc.components?.schemas?.MessageDto).toMatchObject({
        required: ['content'],
      });
      expect(createOpenApiDocument(app)).toEqual(doc);
    } finally {
      await app.close();
    }
  });
});
