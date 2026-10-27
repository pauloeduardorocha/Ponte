export interface ErrorMapPoint {
  id: string;
  latitude: number;
  longitude: number;
  createdAt: string;
  eventType: string;
  route: string;
}

export function errorLocation(
  report: Record<string, unknown>,
): ErrorMapPoint | undefined {
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const geo = object(object(object(report.device).network).geo);
  if (
    typeof geo.latitude !== 'number' ||
    !Number.isFinite(geo.latitude) ||
    Math.abs(geo.latitude) > 90 ||
    typeof geo.longitude !== 'number' ||
    !Number.isFinite(geo.longitude) ||
    Math.abs(geo.longitude) > 180
  )
    return undefined;
  return {
    id: String(report.id ?? ''),
    latitude: geo.latitude,
    longitude: geo.longitude,
    createdAt: String(report.createdAt ?? report.occurredAt ?? ''),
    eventType: String(report.eventType ?? ''),
    route: String(report.route ?? ''),
  };
}
