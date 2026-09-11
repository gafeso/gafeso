'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { LIBELLES } from '@/lib/libelles';
import { ModuleEtat, estBasculable, phraseVerrouillage } from '@/lib/modules';
import { invaliderModulesActifs } from '@/lib/modules-actifs';

const T = LIBELLES.modules;

/**
 * Activation des modules par établissement — P4-2.
 *
 * ⚠ L'ÉCRAN AFFICHE CE QUE L'API DÉCLARE. La maquette décrit douze modules,
 * l'API en déclare huit : afficher les quatre autres donnerait des
 * interrupteurs qui ne commandent rien. Une maquette dit une intention, pas un
 * état.
 *
 * ⚠ LE VERROUILLAGE DE L'INTERFACE NE DISPENSE PAS L'API DE REFUSER. Ce qui est
 * verrouillé ici n'est pas cliquable — pas de refus après clic (décision 6) —
 * mais l'API garde sa propre décision : une interface qui cache sans que
 * l'API refuse laisse une porte ouverte.
 */
export default function ModulesPage() {
  const { functions } = useMyFunctions();
  const peutGerer = functions?.includes('modules.gerer');

  // `null` tant qu'on ne sait pas : jamais une liste vide, qui se lirait comme
  // « aucun module déclaré » alors qu'on n'a pas encore demandé.
  const [modules, setModules] = useState<ModuleEtat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ModuleEtat | null>(null);

  const charger = useCallback(async () => {
    setError(null);
    try {
      setModules(await api<ModuleEtat[]>('/modules', {}, getToken()));
    } catch (err) {
      setModules(null);
      setError(err instanceof ApiError ? err.message : T.chargementImpossible);
    }
  }, []);

  useEffect(() => {
    if (peutGerer) void charger();
  }, [peutGerer, charger]);

  async function basculer(m: ModuleEtat, actif: boolean) {
    setEnCours(m.id);
    setError(null);
    try {
      await api(`/modules/${m.id}`, { method: 'PATCH', body: JSON.stringify({ actif }) }, getToken());
      setConfirmation(null);
      // ⚠ On RECHARGE tout : éteindre un module change l'état des autres —
      // celui qui en dépendait devient verrouillé, celui qui le requérait se
      // déverrouille. Modifier la seule ligne touchée afficherait un état faux
      // pour ses voisines.
      // ⚠ ET LE MENU AVEC. La coque garde sa propre copie de l'état : sans
      // cette invalidation, l'entrée d'un module qu'on vient d'éteindre restait
      // affichée jusqu'au prochain rechargement complet — l'interface mentait
      // sur ce qu'elle venait elle-même de faire.
      invaliderModulesActifs();
      await charger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : T.chargementImpossible);
    } finally {
      setEnCours(null);
    }
  }

  if (functions && !peutGerer) {
    return <Alert tone="error">{LIBELLES.refusDeDroit.modules}</Alert>;
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">{T.titre}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">{T.introduction}</p>

      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      {!modules && !error && (
        <p className="mt-5 text-sm text-muted">{LIBELLES.commun.chargement}</p>
      )}

      {modules && modules.length === 0 && (
        <p className="mt-5 text-sm text-muted">{T.aucunModule}</p>
      )}

      {confirmation && (
        <Card className="mt-4 border-red-200">
          <p className="font-semibold">{T.confirmerTitre(confirmation.libelle)}</p>
          {/* ⚠ La confirmation LISTE ce qui disparaît. « Êtes-vous sûr ? » ne dit
              pas ce qu'on perd, et c'est précisément ce qu'il faut relire. */}
          {confirmation.ecrans.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-muted">{T.confirmerEcrans}</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {confirmation.ecrans.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">{T.confirmerSansEcrans}</p>
          )}
          <p className="mt-2 text-sm font-medium">{T.aucuneDonneeSupprimee}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={enCours === confirmation.id}
              onClick={() => basculer(confirmation, false)}
            >
              {T.confirmer}
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={() => setConfirmation(null)}>
              {T.annuler}
            </Button>
          </div>
        </Card>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {modules?.map((m) => (
          <Card key={m.id} className="!p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-[14rem] flex-1">
                <p className="font-medium">
                  {m.libelle}{' '}
                  <Badge tone={m.actif ? 'ocre' : 'neutral'}>
                    {m.actif ? T.actif : T.inactif}
                  </Badge>
                </p>
                <p className="mt-0.5 text-sm text-muted">{m.description}</p>
                {/* Le motif du verrouillage, tel que l'API le compose : il nomme
                    les modules en cause, que le front ne connaît pas autrement. */}
                {/* ⚠ Phrase composée ICI à partir du motif STRUCTURÉ rendu par
                    l'API — backlog n° 14 refermé. `motifVerrouillage` est sa
                    version française dépréciée : on ne s'en sert plus que si un
                    code inconnu apparaissait, plutôt que de verrouiller une
                    ligne sans dire pourquoi. */}
                {(phraseVerrouillage(m.motif) ?? m.motifVerrouillage) && (
                  <p className="mt-1 text-xs text-muted">
                    {phraseVerrouillage(m.motif) ?? m.motifVerrouillage}
                  </p>
                )}
              </div>
              {/* ⚠ RIEN D'INERTE : une ligne verrouillée n'a pas de bouton du
                  tout. Un bouton grisé invite à cliquer et refuse ensuite ;
                  l'absence dit la même chose sans promettre un geste. */}
              {estBasculable(m) && (
                <Button
                  variant={m.actif ? 'ghost' : undefined}
                  className="min-h-11"
                  disabled={enCours === m.id}
                  onClick={() => (m.actif ? setConfirmation(m) : basculer(m, true))}
                >
                  {m.actif ? T.desactiver(m.libelle) : T.activer(m.libelle)}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {modules && modules.length > 0 && (
        <p className="mt-4 text-xs text-muted">{T.aucuneDonneeSupprimee}</p>
      )}
    </div>
  );
}
