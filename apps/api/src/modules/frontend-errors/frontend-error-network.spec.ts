import type { Request } from 'express';
import { frontendErrorNetwork } from './frontend-error-network';

function request(
  headers: Record<string, string | string[]> = {},
  address = '::ffff:192.0.2.10',
) {
  return { headers, socket: { remoteAddress: address } } as unknown as Request;
}

describe('Frontend error request network', () => {
  it('records validated Vercel IP and decodes the approximate city and coordinates', () => {
    expect(
      frontendErrorNetwork(
        request({
          'x-vercel-forwarded-for': '2001:db8::1',
          'x-vercel-ip-country': 'PT',
          'x-vercel-ip-country-region': '11',
          'x-vercel-ip-city': 'S%C3%A3o%20Domingos',
          'x-vercel-ip-latitude': '38.72',
          'x-vercel-ip-longitude': '-9.14',
        }),
        true,
      ),
    ).toEqual({
      ipAddress: '2001:db8::1',
      ipSource: 'vercel',
      geo: {
        source: 'vercel',
        country: 'PT',
        region: '11',
        city: 'São Domingos',
        latitude: 38.72,
        longitude: -9.14,
      },
    });
  });
  it('ignores proxy and location headers outside the deployed Vercel runtime', () => {
    expect(
      frontendErrorNetwork(
        request({
          'x-forwarded-for': '198.51.100.1',
          'x-vercel-forwarded-for': '198.51.100.2',
          'x-vercel-ip-country': 'PT',
          'x-vercel-ip-latitude': '1',
          'x-vercel-ip-longitude': '2',
        }),
        false,
      ),
    ).toEqual({ ipAddress: '192.0.2.10', ipSource: 'connection' });
  });
  it('ignores malformed IPs, arrays, malformed encoding and incomplete coordinates', () => {
    expect(
      frontendErrorNetwork(
        request({
          'x-vercel-forwarded-for': '192.0.2.1, 198.51.100.2',
          'x-vercel-ip-country': ['PT', 'US'],
          'x-vercel-ip-country-region': '<script>',
          'x-vercel-ip-city': '%invalid',
          'x-vercel-ip-latitude': '91',
          'x-vercel-ip-longitude': '-9',
        }),
        true,
      ),
    ).toEqual({ ipAddress: '192.0.2.10', ipSource: 'connection' });
  });
  it('preserves zero coordinates and tolerates an unavailable socket IP', () => {
    expect(
      frontendErrorNetwork(
        request(
          { 'x-vercel-ip-latitude': '0', 'x-vercel-ip-longitude': '0' },
          '',
        ),
        true,
      ),
    ).toEqual({ geo: { source: 'vercel', latitude: 0, longitude: 0 } });
    expect(frontendErrorNetwork(request({}, 'invalid'), false)).toEqual({});
  });
});
