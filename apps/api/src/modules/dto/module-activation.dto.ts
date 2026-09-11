import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ModuleActivationDto {
  @ApiProperty({ description: 'Activer (true) ou désactiver (false) le module.' })
  @IsBoolean()
  actif!: boolean;
}
