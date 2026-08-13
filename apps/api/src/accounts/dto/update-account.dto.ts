import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAccountDto {
  @ApiPropertyOptional({ example: 'Salif' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Ouédraogo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: 'salif.ouedraogo@exemple.bf' })
  @IsOptional()
  @IsEmail()
  email?: string;

  // `className` a été RETIRÉ volontairement. La classe d'un étudiant est
  // désormais dérivée de son inscription (POST /enrollment/enroll) et
  // `users.class_name` n'en est qu'un reflet — voir enrollment.service.
  //
  // Auparavant, ce champ écrivait la classe en TEXTE LIBRE sans toucher aux
  // inscriptions : un compte pouvait afficher « L1_DROIT » alors que son
  // inscription réelle était « M2_MEDECINE ». Comme les règles d'accès
  // comparent `users.class_name` (access-control.matching), l'accès était
  // refusé de façon incompréhensible.
  //
  // ValidationPipe est en `forbidNonWhitelisted` : envoyer encore `className`
  // ici renvoie un 400 explicite plutôt qu'une écriture silencieuse.

  @ApiPropertyOptional({
    description:
      'ID du rôle dynamique à assigner. Absent = inchangé, null = retirer ' +
      'le rôle dynamique (repli sur le rôle système implicite de l’enum).',
  })
  @IsOptional()
  @IsString()
  roleId?: string | null;
}
