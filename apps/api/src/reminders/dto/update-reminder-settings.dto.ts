import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
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
  enabled?: boolean;

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
