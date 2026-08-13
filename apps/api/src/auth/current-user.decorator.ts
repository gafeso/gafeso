import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from './jwt.strategy';

/**
 * Injecte l'utilisateur authentifié (payload JWT posé par la stratégie).
 *   maRoute(@CurrentUser() user: JwtPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload | undefined => {
    return ctx.switchToHttp().getRequest<Request>().user as
      | JwtPayload
      | undefined;
  },
);
