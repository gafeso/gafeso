'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { LIBELLES } from '@/lib/libelles';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Button, Card, Input, Select } from '@/components/ui';

interface AuthorRow {
  id: string;
  displayName: string;
  workCount: number;
}

export default function AdminAuthorsPage() {
  const { functions } = useMyFunctions();
  const canManage = functions?.includes('catalogue.gerer');

  // ⚠ `null` TANT QU'ON NE SAIT PAS, jamais `[]`. Un tableau vide ne distingue
  // pas « pas encore chargé » de « aucun auteur », et l'écran affirmait donc
  // « Aucun auteur. » avant d'avoir la réponse — alors que le fichier
  // d'autorités en contient 278. Mesuré le 10 septembre 2026 : vrai à
  // l'instant du rendu, faux 250 ms plus tard. En local c'est un battement de
  // cil ; sur le réseau d'un campus, ça se lit.
  const [authors, setAuthors] = useState<AuthorRow[] | null>(null);
  /**
   * Pagination — lue dans la réponse, qui la portait DÉJÀ.
   *
   * ⚠ L'API rendait `total`, `page` et `totalPages` depuis le début ; l'écran
   * ne lisait que `authors` et en affichait 200 sans le dire. Mesuré sur un
   * fonds de 8 000 notices : 200 lignes pour 557 auteurs, aucun compteur,
   * aucune commande de page. Ce n'était pas une limite à ajouter côté API,
   * c'était une réponse qu'on n'écoutait qu'à moitié.
   */
  const [pagination, setPagination] = useState<{ total: number; page: number; totalPages: number } | null>(null);
  const [numeroPage, setNumeroPage] = useState(1);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState('');

  const load = useCallback(async (query: string, page: number) => {
    setError(null);
    try {
      // ⚠ `page` EST ENVOYÉE, ET ÇA A ÉTÉ VÉRIFIÉ AVANT DE L'ÉCRIRE. La route
      // la refusait hier — 400, « property page should not exist » — tout en
      // rendant `totalPages` : un contrat qui décrivait un parcours qu'il
      // n'offrait pas. Elle l'accepte depuis que la session back a corrigé son
      // DTO. Mesuré sur 557 auteurs avant de recâbler l'écran : 200, 200, 157.
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      params.set('page', String(page));
      const res = await api<{
        authors: AuthorRow[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/authors${params.toString() ? `?${params}` : ''}`, {}, getToken());
      setAuthors(res.authors);
      setPagination({ total: res.total, page: res.page, totalPages: res.totalPages });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    if (!canManage) return;
    const t = setTimeout(() => void load(q, numeroPage), 250);
    return () => clearTimeout(t);
  }, [canManage, q, numeroPage, load]);

  /**
   * ⚠ UNE NOUVELLE RECHERCHE REVIENT À LA PAGE 1. Sans cela, chercher depuis la
   * page 3 demande la page 3 d'un résultat qui n'en a qu'une : l'écran affiche
   * « Aucun auteur » sur une recherche qui en trouve dix-sept. Le même défaut
   * avait été corrigé sur le catalogue — il se reproduit partout où un filtre et
   * une pagination coexistent.
   */
  useEffect(() => {
    setNumeroPage(1);
  }, [q]);


  async function rename(id: string) {
    setError(null);
    setNotice(null);
    try {
      await api(`/authors/${id}`, { method: 'PATCH', body: JSON.stringify({ displayName: renameValue }) }, getToken());
      setNotice('Fiche renommée (propagée à toutes les notices).');
      setRenamingId(null);
      void load(q, numeroPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Renommage impossible.');
    }
  }

  async function merge(id: string) {
    setError(null);
    setNotice(null);
    try {
      await api(`/authors/${id}/merge`, { method: 'POST', body: JSON.stringify({ intoId: mergeTarget }) }, getToken());
      setNotice('Fiches fusionnées.');
      setMergingId(null);
      setMergeTarget('');
      void load(q, numeroPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fusion impossible.');
    }
  }

  async function remove(id: string) {
    setError(null);
    setNotice(null);
    try {
      await api(`/authors/${id}`, { method: 'DELETE' }, getToken());
      setNotice('Fiche supprimée.');
      void load(q, numeroPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Suppression impossible.');
    }
  }

  if (functions && !canManage) {
    return (
      <Alert tone="error">
        Vous n’avez pas la permission de gérer le catalogue (fonction
        «&nbsp;catalogue.gerer&nbsp;»).
      </Alert>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">Auteurs</h1>
      <p className="mt-1 text-sm text-muted">
        Fichier d’autorités : renommer (propagé partout), fusionner deux doublons,
        supprimer une fiche sans œuvre.
      </p>

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      <div className="mt-5 max-w-sm">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un auteur…" />
      </div>

      <Card className="mt-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Nom</th>
                <th className="py-2 pr-3">Œuvres</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(authors ?? []).map((a) => (
                <tr key={a.id} className="border-b border-line/60 align-top">
                  <td className="py-2 pr-3">
                    {renamingId === a.id ? (
                      <div className="flex items-center gap-2">
                        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="max-w-xs" />
                        <Button onClick={() => rename(a.id)}>Enregistrer</Button>
                        <Button variant="ghost" onClick={() => setRenamingId(null)}>Annuler</Button>
                      </div>
                    ) : (
                      <Link href={`/opac/auteurs/${a.id}`} className="text-ocre underline">
                        {a.displayName}
                      </Link>
                    )}
                    {mergingId === a.id && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted">Fusionner dans :</span>
                        <div className="min-w-[14rem]">
                          <Select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                            <option value="">Choisir une fiche…</option>
                            {(authors ?? [])
                              .filter((o) => o.id !== a.id)
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.displayName}
                                </option>
                              ))}
                          </Select>
                        </div>
                        <Button onClick={() => merge(a.id)} disabled={!mergeTarget}>
                          Fusionner
                        </Button>
                        <Button variant="ghost" onClick={() => setMergingId(null)}>Annuler</Button>
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3">{a.workCount}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setRenamingId(a.id);
                          setRenameValue(a.displayName);
                          setMergingId(null);
                        }}
                      >
                        Renommer
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setMergingId(a.id);
                          setMergeTarget('');
                          setRenamingId(null);
                        }}
                      >
                        Fusionner
                      </Button>
                      {a.workCount === 0 && (
                        <Button variant="ghost" onClick={() => remove(a.id)}>
                          Supprimer
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {authors === null && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-muted">
                    {LIBELLES.commun.chargement}
                  </td>
                </tr>
              )}
              {authors !== null && authors.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-muted">
                    Aucun auteur.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/*
          ⚠ LE COMPTEUR N'EST PAS UN ORNEMENT. C'est lui qui dit à la
          bibliothécaire que l'index en contient 557 quand elle en voit 200 —
          l'absence de ce chiffre est ce qui faisait passer une liste tronquée
          pour une liste complète. Et il ne s'affiche qu'une fois la réponse
          arrivée : un nombre est une affirmation.
        */}
        {pagination && (
          <p className="mt-3 text-sm text-muted">
            {LIBELLES.auteurs.compte(pagination.total)}
          </p>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="mt-2 flex items-center justify-center gap-3">
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={pagination.page <= 1}
              onClick={() => setNumeroPage((n) => Math.max(1, n - 1))}
            >
              {LIBELLES.auteurs.pagePrecedente}
            </Button>
            <span className="text-sm text-muted">
              {LIBELLES.auteurs.pageSur(pagination.page, pagination.totalPages)}
            </span>
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setNumeroPage((n) => n + 1)}
            >
              {LIBELLES.auteurs.pageSuivante}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
