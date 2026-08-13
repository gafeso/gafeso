import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createPublicKey } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { JwtPayload } from '../auth/jwt.strategy';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { RegisterDeviceDto } from './dto/offline.dto';

export type TenantDb = PrismaClient;

/** Enregistrement d'un appareil : sa clé publique servira à envelopper la CEK. */
@Injectable()
export class OfflineDevicesService {
  constructor(private readonly audit: AuditService) {}

  async register(
    db: TenantDb,
    tenant: ResolvedTenant,
    user: JwtPayload,
    ip: string | undefined,
    dto: RegisterDeviceDto,
  ) {
    // La clé DOIT être une clé publique EC P-256 en SPKI DER base64 (EC-KEM côté licence).
    try {
      const key = createPublicKey({
        key: Buffer.from(dto.publicKey, 'base64'),
        format: 'der',
        type: 'spki',
      });
      if (key.asymmetricKeyType !== 'ec') throw new Error(`type ${key.asymmetricKeyType}`);
      const curve = key.asymmetricKeyDetails?.namedCurve;
      if (curve !== 'prime256v1') throw new Error(`courbe ${curve}, prime256v1 (P-256) attendue`);
    } catch (error) {
      throw new BadRequestException(
        `Clé publique d’appareil invalide (EC P-256, SPKI DER base64 attendu) : ${(error as Error).message}`,
      );
    }

    const device = await db.device.create({
      data: {
        userId: user.sub,
        label: dto.label ?? null,
        platform: dto.platform ?? null,
        publicKey: dto.publicKey,
      },
    });

    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.OFFLINE_DEVICE_REGISTER,
      targetType: 'device',
      targetId: device.id,
      targetLabel: device.label,
      ip: ip ?? null,
    });

    return { id: device.id, label: device.label, platform: device.platform, createdAt: device.createdAt };
  }
}
