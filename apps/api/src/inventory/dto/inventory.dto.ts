import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export const INVENTORY_SCOPES = ['ALL', 'LOCATION'] as const;

export class CreateSessionDto {
  @ApiProperty({ example: 'Récolement Documentation — juillet' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la session est requis.' })
  name: string;

  @ApiProperty({ enum: INVENTORY_SCOPES, example: 'LOCATION' })
  @IsIn(INVENTORY_SCOPES, { message: 'Périmètre invalide (ALL ou LOCATION).' })
  scope: (typeof INVENTORY_SCOPES)[number];

  @ApiPropertyOptional({ example: 'Documentation', description: 'Requis si scope = LOCATION.' })
  @IsOptional()
  @IsString()
  location?: string;
}

export class ScanDto {
  @ApiProperty({ example: 'BIB-000123' })
  @IsString()
  @IsNotEmpty({ message: 'Code-barres vide.' })
  barcode: string;
}
