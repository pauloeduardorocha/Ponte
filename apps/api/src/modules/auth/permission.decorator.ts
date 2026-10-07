import { SetMetadata } from '@nestjs/common';
import type { Permission as PermissionCode } from '@church/shared';

export const PERMISSION_KEY = 'permissions';
export const PUBLIC_KEY = 'public';
export const Permission = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSION_KEY, permissions);
export const Public = () => SetMetadata(PUBLIC_KEY, true);
