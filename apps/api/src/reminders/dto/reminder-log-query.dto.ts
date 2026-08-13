import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Filtres de consultation du journal des rappels. */
export class ReminderLogQueryDto {
  @ApiPropertyOptional({ enum: ['DUE_SOON', 'OVERDUE'] })
  @IsOptional()
  @IsIn(['DUE_SOON', 'OVERDUE'])
  type?: 'DUE_SOON' | 'OVERDUE';

  @ApiPropertyOptional({ enum: ['SENT', 'FAILED', 'SKIPPED_NO_EMAIL', 'PENDING'] })
  @IsOptional()
  @IsIn(['SENT', 'FAILED', 'SKIPPED_NO_EMAIL', 'PENDING'])
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
