import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateCollectionDto {
  @ApiPropertyOptional({ example: 'Ressources Droit L1 (2026)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ description: 'Chaîne vide = effacer la description.' })
  @IsOptional()
  @IsString()
  description?: string;
}
