import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { ResolvedTenant } from './tenancy.service';

/**
 * Injecte le tenant résolu par le TenantMiddleware dans un handler :
 *   maRoute(@CurrentTenant() tenant: ResolvedTenant | null) { ... }
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ResolvedTenant | null => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.tenant ?? null;
  },
);
