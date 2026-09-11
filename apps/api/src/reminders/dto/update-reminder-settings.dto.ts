import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReglageDeplaceVersModule } from '../../modules/reglage-deplace-vers-module.validator';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  Validate,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Un modèle (sujet + corps). Longueurs bornées ; les variables {…} sont libres. */
export class ReminderTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Le sujet est limité à 200 caractères.' })
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000, { message: 'Le corps est limité à 4000 caractères.' })
  body?: string;
}

export class ReminderTemplatesDto {
  @ApiPropertyOptional({ type: ReminderTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderTemplateDto)
  dueSoon?: ReminderTemplateDto;

  @ApiPropertyOptional({ type: ReminderTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderTemplateDto)
  overdue?: ReminderTemplateDto;
}

/** Paramètres de rappels par établissement (tout optionnel : PATCH partiel). */
export class UpdateReminderSettingsDto {
  @ApiPropertyOptional({ description: 'Activation globale des rappels automatiques.' })
  @IsOptional()
  @IsBoolean()
  /**
   * ⚠ DÉMÉNAGÉ le 11 septembre 2026 — l'activation des rappels est un MODULE.
   *
   * Le champ reste DÉCLARÉ, et refusé, pour que le message nomme la nouvelle
   * route : retiré, il produirait un 400 générique du `ValidationPipe`
   * (« property enabled should not exist ») et l'appelant chercherait sa faute
   * là où il n'y a qu'un déplacement.
   *
   * Il est aussi ce qui empêche la régression : deux endroits où l'on éteint la
   * même chose est précisément la faute que l'absorption supprime.
   */
  @ApiPropertyOptional({
    type: Boolean,
    deprecated: true,
    description:
      '⚠ DÉMÉNAGÉ — ce champ est REFUSÉ ici. Le type est déclaré explicitement ' +
      'parce que Swagger ne sait pas décrire un champ typé `never` : il y voit ' +
      'une dépendance circulaire et REFUSE DE DÉMARRER l’application. Le `never` ' +
      'reste côté TypeScript (une réutilisation ne compile pas), le type ' +
      'annoncé ici est celui que le champ AVAIT.',
  })
  @Validate(ReglageDeplaceVersModule)
  enabled?: never;

  @ApiPropertyOptional({ description: 'N : rappel d’échéance J-N (0 à 30).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  daysBefore?: number;

  @ApiPropertyOptional({ description: 'M : relance de retard tous les M jours (1 à 90).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  overdueRepeatDays?: number;

  @ApiPropertyOptional({ type: ReminderTemplatesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderTemplatesDto)
  templates?: ReminderTemplatesDto;
}
