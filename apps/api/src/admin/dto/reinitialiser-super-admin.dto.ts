import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsEmail, IsNotEmpty } from 'class-validator';

/**
 * Réinitialiser le mot de passe d'un super-admin plateforme.
 *
 * ⚠ AUCUN MOT DE PASSE N'EST ACCEPTÉ ICI, et c'est délibéré : le serveur en
 * ENGENDRE un fort et le rend UNE FOIS. Accepter une valeur ferait voyager un
 * secret choisi par l'opérateur — donc probablement réutilisé ailleurs — dans
 * un corps de requête que des journaux intermédiaires peuvent garder.
 *
 * C'est la même convention que `provision-production.mjs` pour ce même compte.
 */
export class ReinitialiserSuperAdminDto {
  @ApiProperty({ example: 'superadmin@exemple.org' })
  @IsEmail({}, { message: 'Adresse invalide.' })
  @IsNotEmpty()
  email: string;

  /**
   * ⚠ SECOND GESTE EXPLICITE. Cette route ENFERME DEHORS le super-admin en
   * service : son mot de passe actuel cesse de fonctionner à la seconde où
   * elle réussit. Un appel fait par distraction — une commande rejouée, un
   * script de déploiement recopié — coûterait l'accès à la plateforme.
   *
   * Le drapeau ne protège pas contre un attaquant : il porte la clé, il le
   * posera. Il protège contre l'ACCIDENT, qui est le mode de panne réel.
   */
  @ApiProperty({
    example: true,
    description:
      'Doit valoir exactement `true`. Le mot de passe actuel cessera de ' +
      'fonctionner immédiatement.',
  })
  @Equals(true, {
    message:
      'Confirmation requise : cette opération invalide le mot de passe actuel ' +
      'du super-admin. Renvoyez `confirme: true`.',
  })
  confirme: boolean;
}
