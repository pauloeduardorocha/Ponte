export function isAvatar(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 666691) return false;
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match?.[1]) return false;
  const bytes = Buffer.from(match[1], 'base64');
  return (
    bytes.length >= 4 &&
    bytes.length <= 500_000 &&
    bytes.toString('base64') === match[1] &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}
