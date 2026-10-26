import { SetMetadata } from '@nestjs/common';
import type { Permission as PermissionCode } from '@church/shared';

export const PERMISSION_KEY = 'permissions';
export const PERMISSION_ANY_KEY = 'permissions:any';
export const PermissionAny = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSION_ANY_KEY, permissions);
export const PENDING_ALLOWED_KEY = 'pending:allowed';
export const AllowPending = () => SetMetadata(PENDING_ALLOWED_KEY, true);
export const PUBLIC_KEY = 'public';
export const Permission = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSION_KEY, permissions);
export const Public = () => SetMetadata(PUBLIC_KEY, true);
