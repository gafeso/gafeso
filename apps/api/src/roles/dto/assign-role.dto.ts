import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AssignRoleDto {
  @ApiPropertyOptional({
    description:
      'ID du rôle à assigner. Absent ou null = retirer le rôle dynamique ' +
      '(le compte retombe sur le rôle système implicite de son enum).',
  })
  @IsOptional()
  @IsString()
  roleId?: string | null;
}
