import { isAvatar } from './avatar';
describe('photo byte limits', () => {
  function photo(size: number) {
    const bytes = Buffer.alloc(size);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[size - 2] = 0xff;
    bytes[size - 1] = 0xd9;
    return 'data:image/jpeg;base64,' + bytes.toString('base64');
  }
  it('accepts 500,000 decoded bytes and rejects one more byte', () => {
    expect(isAvatar(photo(500_000))).toBe(true);
    expect(isAvatar(photo(500_001))).toBe(false);
  });
});
