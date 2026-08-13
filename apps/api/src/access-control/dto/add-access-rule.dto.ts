import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AddAccessRuleDto {
  @ApiPropertyOptional({
    example: 'L1_DROIT',
    description: 'Classe ciblée. Absent = toutes les classes de l’école.',
  })
  @IsOptional()
  @IsString()
  className?: string;

  @ApiPropertyOptional({
    example: 'premium',
    description: 'Palier d’abonnement ciblé. Absent = tous les paliers.',
  })
  @IsOptional()
  @IsString()
  subscriptionTier?: string;
}
