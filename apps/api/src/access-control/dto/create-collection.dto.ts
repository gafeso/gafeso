import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CollectionType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCollectionDto {
  @ApiProperty({ example: 'Ressources Droit L1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: CollectionType, example: CollectionType.INTERNAL })
  @IsEnum(CollectionType)
  type: CollectionType;

  @ApiPropertyOptional({
    description: 'ID de la bibliothèque externe ou de l’abonnement source',
  })
  @IsOptional()
  @IsString()
  sourceId?: string;
}
