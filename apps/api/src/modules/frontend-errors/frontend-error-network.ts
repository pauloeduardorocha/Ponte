import { isIP } from 'node:net';
import type { Request } from 'express';

export interface FrontendErrorNetwork {
  ipAddress?: string;
  ipSource?: 'vercel' | 'connection';
  geo?: {
    source: 'vercel';
    country?: string;
    region?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
}

function header(request: Request, name: string) {
  const value = request.headers[name];
  return typeof value === 'string' ? value.trim() : undefined;
}

function ip(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.startsWith('::ffff:') ? value.slice(7) : value;
  return isIP(normalized) ? normalized : undefined;
}

function coordinate(value: string | undefined, limit: number) {
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit
    ? number
    : undefined;
}

export function frontendErrorNetwork(
  request: Request,
  vercel: boolean,
): FrontendErrorNetwork {
  // Proxy headers are trusted only inside the deployed Vercel runtime.
  // Elsewhere, use the socket rather than client-supplied forwarded headers.
  const forwarded = vercel
    ? ip(header(request, 'x-vercel-forwarded-for'))
    : undefined;
  const ipAddress = forwarded ?? ip(request.socket.remoteAddress);
  const network: FrontendErrorNetwork = ipAddress
    ? { ipAddress, ipSource: forwarded ? 'vercel' : 'connection' }
    : {};
  if (!vercel) return network;
  const countryHeader = header(request, 'x-vercel-ip-country');
  const regionHeader = header(request, 'x-vercel-ip-country-region');
  const country =
    countryHeader && /^[A-Z]{2}$/.test(countryHeader)
      ? countryHeader
      : undefined;
  const region =
    regionHeader && /^[A-Za-z0-9-]{1,3}$/.test(regionHeader)
      ? regionHeader
      : undefined;
  let city: string | undefined;
  const cityHeader = header(request, 'x-vercel-ip-city');
  if (cityHeader && cityHeader.length <= 512) {
    try {
      city =
        decodeURIComponent(cityHeader)
          .replace(/[\p{C}]/gu, '')
          .trim()
          .slice(0, 120) || undefined;
    } catch {
      /* Ignore malformed percent encoding without losing the report. */
    }
  }
  const latitude = coordinate(header(request, 'x-vercel-ip-latitude'), 90);
  const longitude = coordinate(header(request, 'x-vercel-ip-longitude'), 180);
  const coordinates =
    latitude !== undefined && longitude !== undefined
      ? { latitude, longitude }
      : {};
  if (country || region || city || Object.keys(coordinates).length)
    network.geo = { source: 'vercel', country, region, city, ...coordinates };
  return network;
}
