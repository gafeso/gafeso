'use client';

import { useMyFunctions } from '@/lib/functions';
import { Alert } from '@/components/ui';
import { LIBELLES } from '@/lib/libelles';
import { CirculationPolicySettings } from '@/components/circulation-policy-settings';

const T = LIBELLES.reglesDePret;

/**
 * Règles de prêt — écran né de la scission de /admin/parametres (dette n° 2).
 *
 * ⚠ POURQUOI CET ÉCRAN EXISTE. /admin/parametres portait l'identité de
 * l'établissement ET les règles de prêt, et réclamait donc DEUX permissions —
 * `etablissement.apparence` OU `etablissement.regles`. Le besoin de deux droits
 * pour un écran était le symptôme : modifier un logo et fixer la durée d'un
 * prêt ne sont pas le même métier, et ne devraient pas exiger le même droit.
 *
 * ⚠ CE QUI N'EST PAS ICI, ET CE N'EST PAS UN OUBLI. Le paramétrage des rappels
 * de retard vivait sur le même écran, mais son API exige `circulation.retards`
 * — une TROISIÈME permission, celle du guichet. Le laisser ici aurait donné un
 * bloc qui refuse à la personne même qui voit l'écran. Il rejoint
 * /admin/rappels, où le droit et le métier concordent.
 */
export default function ReglesDePretPage() {
  const { functions } = useMyFunctions();
  const peutGerer = functions?.includes('etablissement.regles');

  if (functions && !peutGerer) {
    return <Alert tone="error">{LIBELLES.refusDeDroit.reglesDePret}</Alert>;
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">{T.titre}</h1>
      <p className="mt-1 text-sm text-muted">{T.introduction}</p>
      <div className="max-w-2xl">
        <CirculationPolicySettings />
      </div>
    </div>
  );
}
