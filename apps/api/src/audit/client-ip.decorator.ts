import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * IP réelle du client. `req.ip` est fiable grâce au `trust proxy` configuré
 * strictement sur les proxys internes (main.ts) : il reflète l'IP publique du
 * visiteur, pas celle du conteneur web. Utilisé pour tracer les actions dans
 * le journal d'audit.
 */
export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    return ctx.switchToHttp().getRequest<Request>().ip;
  },
);
