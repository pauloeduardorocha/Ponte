import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
export interface AuditContext {
  userId?: string;
  ip: string;
  userAgent: string;
}
export const auditContext = new AsyncLocalStorage<AuditContext>();
export function auditMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  auditContext.run(
    {
      ip: (req.ip ?? req.socket.remoteAddress ?? '').slice(0, 64),
      userAgent: [...(req.get('user-agent') ?? '')]
        .filter((c) => c.charCodeAt(0) >= 32)
        .join('')
        .slice(0, 1024),
    },
    next,
  );
}
export async function bindAudit(tx: Prisma.TransactionClient) {
  const context = auditContext.getStore();
  if (!context) return;
  await tx.$executeRaw`SELECT set_config('app.audit_user',${context.userId ?? ''},true), set_config('app.audit_ip',${context.ip},true), set_config('app.audit_agent',${context.userAgent},true)`;
}
export const auditRequestFields = () => {
  const context = auditContext.getStore();
  return { ip: context?.ip ?? null, userAgent: context?.userAgent ?? null };
};
