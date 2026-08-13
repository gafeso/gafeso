import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AddRecordDto {
  @ApiProperty({ description: 'ID d’un BiblioRecord numérisé (catalogue local de l’école)' })
  @IsString()
  @IsNotEmpty()
  recordId: string;
}
