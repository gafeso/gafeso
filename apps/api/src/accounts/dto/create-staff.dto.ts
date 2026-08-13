import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsIn, IsNotEmpty, IsString } from 'class-validator';

// Rôles du personnel (STUDENT exclu : les étudiants passent par /register).
export const STAFF_ROLES = [
  UserRole.LIBRARIAN,
  UserRole.MANAGER,
  UserRole.ACQUISITIONS,
  UserRole.ADMIN,
] as const;

export class CreateStaffDto {
  @ApiProperty({ example: 'salif.ouedraogo@exemple.bf' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Salif' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Ouédraogo' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ enum: STAFF_ROLES, example: UserRole.LIBRARIAN })
  @IsIn(STAFF_ROLES as unknown as string[])
  role: UserRole;
}
