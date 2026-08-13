import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/** Prêt : identification au guichet par codes-barres (exemplaire + adhérent). */
export class CheckoutDto {
  @ApiProperty({ example: 'ZK-000123', description: 'Code-barres de l’exemplaire' })
  @IsString()
  @IsNotEmpty()
  itemBarcode: string;

  @ApiProperty({ example: 'P-2026-0001', description: 'Code-barres de l’adhérent' })
  @IsString()
  @IsNotEmpty()
  patronBarcode: string;
}

export class ReturnDto {
  @ApiProperty({ example: 'ZK-000123', description: 'Code-barres de l’exemplaire rendu' })
  @IsString()
  @IsNotEmpty()
  itemBarcode: string;
}

export class PlaceHoldDto {
  @ApiProperty({ description: 'Notice réservée' })
  @IsUUID()
  recordId: string;

  @ApiProperty({ example: 'P-2026-0001', description: 'Code-barres de l’adhérent' })
  @IsString()
  @IsNotEmpty()
  patronBarcode: string;
}

export class CreateRuleDto {
  @ApiProperty({ example: 'etudiant', description: 'Catégorie d’adhérent' })
  @IsString()
  @IsNotEmpty()
  patronCategory: string;

  @ApiProperty({
    example: 'livre',
    description: "Type d’exemplaire ('*' = tous les types)",
  })
  @IsString()
  @IsNotEmpty()
  itemType: string;

  @ApiProperty({ example: 14, description: 'Durée du prêt en jours' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  loanPeriodDays: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxRenewals?: number;

  @ApiPropertyOptional({ example: 5, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxCheckouts?: number;

  @ApiPropertyOptional({
    example: 50,
    default: 0,
    description: 'Amende par jour de retard, en FCFA (XOF)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  finePerDay?: number;
}

export class UpdateRuleDto extends PartialType(CreateRuleDto) {}
