import { ApiProperty } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';
import { IsIn } from 'class-validator';

// Statuts qu'un gestionnaire peut poser manuellement (pas PENDING).
export const MANAGEABLE_STATUSES = [
  AccountStatus.ACTIVE,
  AccountStatus.SUSPENDED,
] as const;

export class UpdateStatusDto {
  @ApiProperty({ enum: MANAGEABLE_STATUSES, example: AccountStatus.SUSPENDED })
  @IsIn(MANAGEABLE_STATUSES as unknown as string[])
  status: AccountStatus;
}
