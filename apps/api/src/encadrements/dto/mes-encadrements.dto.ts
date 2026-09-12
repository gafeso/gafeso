import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * ⚠ `page` EST ACCEPTÉE PARCE QUE LA RÉPONSE REND `totalPages`.
 *
 * L'inverse a été payé sur `GET /authors` : une réponse qui décrivait un
 * parcours que la route refusait, et un client de bonne foi qui envoie `page=1`
 * reçoit « property page should not exist » à la place de sa liste. L'invariant
 * est désormais tenu par un test pour toute l'API.
 */
export class MesEncadrementsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
