import type { Metadata } from 'next';
import { SectionPasEncore } from '@/components/section-pas-encore';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.espaceLecteur.horsLigne;

export const metadata: Metadata = { title: T.titre };

/**
 * « Mes documents hors ligne » — ce qu'un lecteur a emporté sur son appareil.
 *
 * ⚠ L'ÉCRAN EXISTE AVANT SA ROUTE, et c'est une décision : avec la circulation
 * éteinte, « Mes prêts » disparaît et le menu du compte ne garderait que « Mon
 * compte ». Un étudiant à distance n'aurait alors plus aucun endroit où
 * chercher ses documents, et il prendrait cette absence pour une erreur de sa
 * part.
 *
 * ⚠ IL NE PROMET PAS L'APPLICATION MOBILE. Elle existe, elle n'est pas publiée,
 * et ce dépôt ne publie rien. Le texte dit où la lecture hors connexion se fait,
 * sans annoncer un téléchargement que personne ne peut encore obtenir.
 *
 * ⚠ Le jour où l'API expose la route des licences hors ligne du lecteur,
 * `espace-lecteur-pas-encore.spec.ts` ÉCHOUE — c'est lui qui se souvient, pas ce
 * commentaire.
 */
export default function MesDocumentsHorsLignePage() {
  return <SectionPasEncore titre={T.titre} pasEncore={T.pasEncore} sortie={T.sortie} />;
}
