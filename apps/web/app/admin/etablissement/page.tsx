'use client';

import { FormEvent, useCallback, useState } from 'react';

import { FormulaireCharge, useFormulaireCharge } from '@/components/formulaire-charge';
import { LIBELLES } from '@/lib/libelles';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Button, Card, Input } from '@/components/ui';
import { TenantQrSection } from '@/components/tenant-qr';

interface TenantSettings {
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
  require2fa: boolean;
  /** Adresse encodée dans le QR — calculée par le serveur, pas par le navigateur. */
  enrollmentUrl?: string | null;
}

export default function EtablissementPage() {
  const { functions: myFunctions } = useMyFunctions();
  // UNE permission, UN métier : l'identité de l'établissement. Les règles de
  // prêt ont leur écran (/admin/regles-de-pret) et leur droit
  // (`etablissement.regles`) — dette n° 2 levée le 11 septembre 2026.
  //
  // ⚠ La case 2FA est ICI parce que l'API la range ICI : elle passe par
  // `PATCH /tenancy/settings`, donc par `etablissement.apparence`. Autrement
  // dit, qui peut changer les couleurs peut lever l'exigence de double
  // authentification. C'est un défaut de COMPOSITION DE DROIT côté API, pas de
  // découpage d'écran — la déplacer ici créerait un bloc qui refuse pour la
  // personne même qui voit l'écran. Signalé, backlog n° 12.
  const canManage = myFunctions?.includes('etablissement.apparence');
  /**
   * ⚠ LA 2FA A SA PROPRE PERMISSION depuis le 11 septembre 2026 :
   * `securite.authentification`. Le bloc n'est donc rendu qu'à qui peut
   * l'écrire — un contrôle visible mais refusé à l'enregistrement est
   * exactement le défaut que la scission de /admin/parametres a levé.
   *
   * Il reste sur CET écran faute d'écran de sécurité ; le jour où il en existe
   * un, ce bloc y va. Aucun rôle système n'est concerné aujourd'hui : seul
   * l'Administrateur porte l'une et l'autre.
   */
  const peutReglerAuthentification = myFunctions?.includes('securite.authentification');

  if (myFunctions && !canManage) {
    return (
      <Alert tone="error">
        Vous n’avez pas la permission de modifier l’établissement (fonction
        «&nbsp;etablissement.apparence&nbsp;» ou
        «&nbsp;etablissement.regles&nbsp;»).
      </Alert>
    );
  }

  /*
   * ⚠ UN SEUL SOUS-ARBRE, quelle que soit la phase. Rendre un écran d'attente
   * PUIS `Reglages` montait deux `<h1>` successifs : React démonte le premier,
   * et un test qui l'avait capturé le trouve détaché. On passe donc
   * l'autorisation au crochet, qui ATTEND sans appeler.
   */
  return (
    <Reglages
      actif={Boolean(canManage)}
      peutReglerAuthentification={Boolean(peutReglerAuthentification)}
    />
  );
}

/**
 * ⭐ LE FORMULAIRE N'EXISTE QU'AVEC SES DONNÉES.
 *
 * ⚠ CE QUE CETTE MIGRATION RÉPARE, et c'est le pire des vingt écrans : les
 * états partaient sur des valeurs par DÉFAUT — `useState('#0F2B46')`. Avant la
 * réponse, l'écran n'avait donc pas l'air vide, il avait l'air **rempli et
 * juste**. Enregistrer à cet instant écrivait des couleurs que personne n'avait
 * choisies par-dessus celles de l'école, et rien à l'écran ne l'annonçait.
 *
 * Désormais `Formulaire` reçoit les réglages en PROPRIÉTÉ : il n'y a aucun
 * instant où il existe sans eux, donc aucun défaut à initialiser.
 */
function Reglages({
  actif,
  peutReglerAuthentification,
}: {
  actif: boolean;
  peutReglerAuthentification: boolean;
}) {
  const charger = useCallback(() => api<TenantSettings>('/tenancy/current'), []);
  const { etat, recharger } = useFormulaireCharge(charger, actif);

  return (
    <FormulaireCharge
      etat={etat}
      titre={<h1 className="font-serif text-3xl font-bold">Établissement</h1>}
      motif={LIBELLES.etablissement.motifChargement}
      recharger={recharger}
    >
      {(settings) => (
        <Formulaire
          settings={settings}
          peutReglerAuthentification={peutReglerAuthentification}
        />
      )}
    </FormulaireCharge>
  );
}

function Formulaire({
  settings,
  peutReglerAuthentification,
}: {
  settings: TenantSettings;
  peutReglerAuthentification: boolean;
}) {
  // ⚠ Initialisés depuis les données REÇUES, jamais depuis un défaut.
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(settings.secondaryColor);
  const [require2fa, setRequire2fa] = useState(settings.require2fa);
  const [saving, setSaving] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function saveSecurity(next: boolean) {
    setSavingSecurity(true);
    setNotice(null);
    setError(null);
    try {
      await api(
        // ⚠ `PATCH /auth/policy`, ET NON `/tenancy/settings`. La politique
        // d'authentification a quitté le module `tenancy` le 11 septembre 2026
        // (backlog n° 12) : elle y était écrite parce que le champ est stocké
        // dans `tenant_settings`, et cela la rangeait derrière
        // `etablissement.apparence` — qui peut changer les couleurs pouvait
        // lever l'exigence de 2FA. Le DTO de tenancy refuse désormais ce champ.
        '/auth/policy',
        { method: 'PATCH', body: JSON.stringify({ require2fa: next }) },
        getToken(),
      );
      setRequire2fa(next);
      setNotice(
        next
          ? LIBELLES.etablissement.deuxFacteursObligatoire
          : LIBELLES.etablissement.deuxFacteursOptionnelle,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : LIBELLES.etablissement.enregistrementImpossible);
    } finally {
      setSavingSecurity(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await api(
        '/tenancy/settings',
        { method: 'PATCH', body: JSON.stringify({ primaryColor, secondaryColor }) },
        getToken(),
      );
      setNotice(LIBELLES.etablissement.couleursEnregistrees);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : LIBELLES.etablissement.enregistrementImpossible);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="mt-1 text-sm text-muted">
        Couleurs de {settings.name}, appliquées sur tout le site (page
        d’accueil, constellation, boutons).
      </p>

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      {settings === null && !error && <p className="mt-5 text-sm text-muted">Chargement…</p>}

      {settings !== null && (
        <Card className="mt-5 max-w-md">
          <form onSubmit={save} className="flex flex-col gap-4">
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              Couleur principale
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-16 cursor-pointer p-1"
                />
                <span className="font-mono text-xs text-muted">{primaryColor}</span>
              </div>
            </label>
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              Couleur secondaire
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-9 w-16 cursor-pointer p-1"
                />
                <span className="font-mono text-xs text-muted">{secondaryColor}</span>
              </div>
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </form>
        </Card>
      )}

      {settings !== null && peutReglerAuthentification && (
        <Card className="mt-5 max-w-md">
          <h2 className="font-serif text-lg font-bold">Sécurité</h2>
          <label className="mt-3 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={require2fa}
              disabled={savingSecurity}
              onChange={(e) => saveSecurity(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-medium">
                Exiger la double authentification pour les rôles sensibles
              </span>
              <span className="mt-0.5 block text-muted">
                S’applique aux comptes disposant de «&nbsp;gérer les comptes&nbsp;»
                ou «&nbsp;modifier l’établissement&nbsp;». À leur prochaine
                connexion, ils devront configurer la 2FA avant d’accéder à leur
                espace.
              </span>
            </span>
          </label>
        </Card>
      )}

      {/*
        ⚠ LES DEUX CONDITIONS ONT DISPARU, et c'est le TYPE qui les a rendues
        inutiles : `settings` est une propriété non nulle, et ce composant n'est
        rendu qu'à qui peut gérer. Un garde devenu décoratif se relit comme une
        protection — mieux vaut qu'il n'existe plus que qu'il rassure pour rien.
      */}
      {(
        <div className="max-w-2xl">
          <TenantQrSection slug={settings.slug} url={settings.enrollmentUrl} />
        </div>
      )}

    </div>
  );
}
