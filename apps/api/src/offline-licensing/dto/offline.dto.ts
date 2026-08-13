import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Clé publique de l’appareil (EC P-256, SPKI DER en base64).' })
  @IsString()
  @MinLength(80)
  @MaxLength(4000)
  publicKey!: string;

  @ApiPropertyOptional({ description: 'Libellé lisible (modèle du téléphone).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ description: 'Plateforme.', enum: ['android'] })
  @IsOptional()
  @IsIn(['android'])
  platform?: string;
}

export class IssueLicenseDto {
  @ApiProperty({ description: 'Identifiant du document (notice) à lire hors-ligne.' })
  @IsString()
  docId!: string;

  @ApiProperty({ description: 'Identifiant de l’appareil enregistré (POST /offline/devices).' })
  @IsString()
  deviceId!: string;
}

export class EntitlementsQueryDto {
  @ApiProperty({ description: 'Licences dont on veut le statut (lot).', type: [String] })
  @IsArray()
  @IsString({ each: true })
  licenseIds!: string[];
}
