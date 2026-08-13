import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AddTitleDto {
  @ApiProperty({ description: 'ID d’un titre du catalogue commercial' })
  @IsString()
  @IsNotEmpty()
  titleId: string;
}
