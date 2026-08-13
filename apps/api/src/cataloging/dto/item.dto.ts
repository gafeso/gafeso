import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ItemStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateItemDto {
  @ApiProperty({ example: 'ZK-000123', description: 'Code-barres unique de l’exemplaire' })
  @IsString()
  @IsNotEmpty()
  barcode: string;

  @ApiPropertyOptional({ example: '342.5 TRA' })
  @IsOptional()
  @IsString()
  callNumber?: string;

  @ApiPropertyOptional({ example: 'Salle de lecture' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'livre' })
  @IsOptional()
  @IsString()
  itemType?: string;

  @ApiPropertyOptional({ enum: ItemStatus, default: ItemStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;
}

export class UpdateItemDto extends PartialType(CreateItemDto) {}
