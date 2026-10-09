import type { Metadata } from 'next';
import { SectionPasEncore } from '@/components/section-pas-encore';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.espaceLecteur.consultations;

export const metadata: Metadata = { title: T.titre };

/**
 * « Mes consultations » — l'historique des lectures EN LIGNE d'un lecteur.
 *
 * ⚠ L'ÉCRAN EXISTE AVANT SA ROUTE, et c'est une décision : avec la circulation
 * éteinte, « Mes prêts » disparaît et le menu du compte ne garderait que « Mon
 * compte ». Un étudiant à distance n'aurait alors plus aucun endroit où
 * chercher ses documents, et il prendrait cette absence pour une erreur de sa
 * part.
 *
 * ⚠ Le jour où l'API expose la route, `espace-lecteur-pas-encore.spec.ts`
 * ÉCHOUE — c'est lui qui se souvient, pas ce commentaire.
 */
export default function MesConsultationsPage() {
  return <SectionPasEncore titre={T.titre} pasEncore={T.pasEncore} sortie={T.sortie} />;
}
