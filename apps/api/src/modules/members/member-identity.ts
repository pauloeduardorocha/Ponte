import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

// An unguessable password requires recovery before first access.
export const initialPasswordHash = () =>
  argon2.hash(randomBytes(32), { type: argon2.argon2id });
export const memberAccountSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
} as const;
