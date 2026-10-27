import {
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FileInterceptor } from '@nestjs/platform-express';
import request from 'supertest';
import { createRequire } from 'node:module';

@Controller()
class RuntimeProbe {
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 32 } }))
  upload(@UploadedFile() file: { size: number }) {
    return { size: file.size };
  }
}

describe('Nest Express runtime compatibility', () => {
  it('keeps the Express adapter on the same major as Nest core', () => {
    const runtimeRequire = createRequire(__filename);
    const core = runtimeRequire('@nestjs/core/package.json') as {
      version: string;
    };
    const adapter = runtimeRequire('@nestjs/platform-express/package.json') as {
      version: string;
    };
    expect(adapter.version.split('.')[0]).toBe(core.version.split('.')[0]);
  });

  it('starts the HTTP adapter and enforces multipart file limits', async () => {
    const module = await Test.createTestingModule({
      controllers: [RuntimeProbe],
    }).compile();
    const app = module.createNestApplication();
    try {
      await app.init();
      await request(app.getHttpServer())
        .get('/health')
        .expect(200, { status: 'ok' });
      await request(app.getHttpServer())
        .post('/upload')
        .attach('file', Buffer.from('test'), 'test.txt')
        .expect(201, { size: 4 });
      await request(app.getHttpServer())
        .post('/upload')
        .attach('file', Buffer.alloc(33), 'large.txt')
        .expect(413);
    } finally {
      await app.close();
    }
  });
});
