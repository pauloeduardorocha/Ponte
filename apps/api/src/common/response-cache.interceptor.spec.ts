import { Controller, Get, Post, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HTTP_CACHE_ROUTES, responseCacheTtl } from '@church/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { ResponseCacheInterceptor } from './response-cache.interceptor';

@Controller('api/v1')
class FixtureController {
  @Get('finance/accounts') accounts() {
    return [];
  }
  @Get('community/birthdays') birthdays() {
    return [];
  }
  @Get('library/books') books() {
    return [];
  }
  @Get('library/books/availability') availability() {
    return [];
  }
  @Get('members') members() {
    throw new UnauthorizedException();
  }
  @Post('finance/accounts') create() {
    return {};
  }
}

describe('HTTP cache policy', () => {
  it('explicitly classifies every GET in the versioned contract', () => {
    const document = JSON.parse(
      readFileSync(resolve(__dirname, '../../../../docs/openapi.json'), 'utf8'),
    );
    const paths = Object.entries(document.paths)
      .filter(([, item]) => (item as { get?: unknown }).get)
      .map(([path]) => path.replace('/api/v1', ''));
    expect(Object.keys(HTTP_CACHE_ROUTES).sort()).toEqual(paths.sort());
  });
  it.each([
    ['/community/birthdays?period=week', 86400],
    ['/finance/accounts', 3600],
    ['/reimbursements/mine', 3600],
    ['/videos/playlists/example', 21600],
    ['/library/books/id', 21600],
    ['/library/books?available=false', 0],
    ['/library/books/availability', 0],
    ['/library/reservations', 0],
    ['/member-portal/dashboard', 0],
    ['/auth/me', 0],
    ['/privacy/me/export', 0],
    ['/unknown', 0],
  ])('classifies %s', (path, ttl) => expect(responseCacheTtl(path)).toBe(ttl));

  it('returns private TTL only for successful eligible reads, preserving Vary and blocking shared caches', async () => {
    const module = await Test.createTestingModule({
      controllers: [FixtureController],
    }).compile();
    const app = module.createNestApplication();
    app.enableCors({ origin: 'https://example.test' });
    app.useGlobalInterceptors(new ResponseCacheInterceptor());
    await app.init();
    try {
      for (const [path, policy] of [
        ['finance/accounts', 'private, max-age=3600'],
        ['community/birthdays', 'private, max-age=86400'],
        ['library/books', 'private, max-age=21600'],
        ['library/books?available=true', 'no-store'],
        ['library/books/availability', 'no-store'],
      ] as const) {
        const result = await request(app.getHttpServer())
          .get(`/api/v1/${path}`)
          .expect(200)
          .expect('Cache-Control', policy);
        expect(result.headers['cdn-cache-control']).toBe('no-store');
        expect(result.headers['vercel-cdn-cache-control']).toBe('no-store');
        if (policy.startsWith('private')) {
          expect(result.headers.vary).toContain('Origin');
          expect(result.headers.vary).toContain('Authorization');
          expect(result.headers.vary).toContain('Cookie');
        }
      }
      await request(app.getHttpServer())
        .post('/api/v1/finance/accounts')
        .expect(201)
        .expect('Cache-Control', 'no-store');
      await request(app.getHttpServer())
        .get('/api/v1/members')
        .expect(401)
        .expect('Cache-Control', 'no-store');
    } finally {
      await app.close();
    }
  });
});
