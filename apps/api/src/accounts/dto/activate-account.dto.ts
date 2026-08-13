import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ActivateAccountDto {
  @ApiPropertyOptional({
    description:
      'Rôle à assigner au compte au moment de l’activation (ID d’un rôle de ' +
      'GET /roles). Absent = le compte garde son rôle implicite (Étudiant). ' +
      'Exige la fonction comptes.gerer en plus de comptes.activer — un ' +
      'activateur simple ne peut pas fabriquer un compte à privilèges.',
  })
  @IsOptional()
  @IsString()
  roleId?: string;
}
