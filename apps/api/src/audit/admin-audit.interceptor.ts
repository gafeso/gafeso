import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';
import { AUDIT_ACTIONS } from './audit.actions';

/**
 * Journalise les appels de MUTATION au contrôleur admin (endpoints protégés par
 * clé API + connexion super-admin) : provisioning, sync-schema, seeds,
 * réindexation, déprovisioning. Actions plateforme (hors tenant) → tenantId null,
 * acteur = « admin-api-key ». Écriture non bloquante (AuditService). Les lectures
 * (GET) ne sont pas journalisées.
 */
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method;
    return next.handle().pipe(
      tap(() => {
        if (method === 'GET') return;
        const slug = (req.params as Record<string, string> | undefined)?.slug;
        void this.audit.log({
          tenantId: null,
          actorEmail: 'admin-api-key',
          actorRole: 'PLATFORM',
          action: AUDIT_ACTIONS.ADMIN_API,
          targetType: slug ? 'tenant' : null,
          targetId: slug ?? null,
          targetLabel: slug ?? null,
          ip: req.ip,
          metadata: { method, path: req.route?.path ?? req.originalUrl },
        });
      }),
    );
  }
}
