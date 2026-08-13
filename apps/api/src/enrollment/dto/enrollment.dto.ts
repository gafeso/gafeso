import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateClassDto {
  @ApiProperty({
    example: 'L1_DROIT',
    description: 'Nom technique (normalisé MAJUSCULES_UNDERSCORE) — référencé par les règles d’accès',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Licence 1 Droit' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: 'L1' })
  @IsOptional()
  @IsString()
  level?: string;
}

export class UpdateClassDto extends PartialType(CreateClassDto) {}

export class EnrollStudentDto {
  @ApiProperty({ description: 'Étudiant (id du schéma tenant)' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'L1_DROIT', description: 'Classe cible (nom technique)' })
  @IsString()
  @IsNotEmpty()
  className: string;

  @ApiPropertyOptional({
    example: '2026-2027',
    description:
      'Année académique. Omise = année courante calculée par le SERVEUR. ' +
      'À ne renseigner que pour inscrire dans une autre année (rattrapage, ' +
      'préparation de la rentrée suivante).',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{4}$/, { message: 'année académique au format AAAA-AAAA' })
  academicYear?: string;
}
