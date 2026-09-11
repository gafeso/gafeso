import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * Politique d'authentification de l'établissement.
 *
 * ⚠ `require2fa` VIVAIT DANS `UpdateTenantSettingsDto`, avec les couleurs et le
 * logo — donc derrière `etablissement.apparence`. Il est ici pour que la
 * permission qui le garde puisse être la sienne
 * (`securite.authentification`), et pour qu'aucune addition future aux
 * réglages d'apparence ne le remette par mégarde sur ce chemin.
 *
 * ⚠ NON OPTIONNEL, à la différence de tous les champs d'apparence. Un PATCH
 * d'apparence est partiel par nature (l'admin ne change qu'une couleur) ; une
 * politique de sécurité se pose, elle ne se laisse pas deviner. Un appel qui
 * n'envoie rien serait un appel dont on ne sait pas s'il voulait activer,
 * désactiver, ou ne rien faire.
 */
export class UpdateAuthenticationPolicyDto {
  @ApiProperty({
    description:
      'Double authentification OBLIGATOIRE pour tout compte portant ' +
      '`comptes.gerer` ou l’une des héritières d’`etablissement.gerer`.',
  })
  @IsBoolean()
  require2fa!: boolean;
}
