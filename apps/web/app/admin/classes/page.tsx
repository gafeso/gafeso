'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { LIBELLES } from '@/lib/libelles';
import { getToken } from '@/lib/session';
import { Alert, Badge, Button, Card, Input, Select } from '@/components/ui';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';

interface SchoolClass {
  id: string;
  name: string;
  label: string | null;
  level: string | null;
  activeStudents: number;
  _count: { enrollments: number };
}

interface EnrollmentRow {
  id: string;
  academicYear: string;
  user: {
    id: string;
    matricule: string | null;
    firstName: string;
    lastName: string;
    email: string;
    status: string;
  };
}

interface ClassDetail {
  id: string;
  enrollments: EnrollmentRow[];
}

export default function ClassesPage() {
  // ⚠ `null` TANT QU'ON NE SAIT PAS, jamais `[]` — un tableau vide ne distingue
  // pas « pas encore chargé » de « il n'y en a aucun », et l'écran affirme
  // alors le vide avant d'avoir la réponse. Même correction que
  // /admin/catalogue le 8 septembre 2026, répliquée le 10.
  const [classes, setClasses] = useState<SchoolClass[] | null>(null);
  const [form, setForm] = useState({ name: '', label: '', level: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Édition inline d'une classe.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', label: '', level: '' });
  // Suppression à confirmation (pas de dialog natif bloquant).
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Panneau d'inscriptions déplié + son contenu.
  const [openClassId, setOpenClassId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // L'année académique est calculée par le SERVEUR quand ce champ est vide
  // (voir api/src/enrollment/academic-year.ts). Elle l'était ICI, sur l'année
  // CIVILE — `${currentYear}-${currentYear + 1}` — donc juste de septembre à
  // décembre et FAUSSE de janvier à août : en mars 2027 on proposait
  // « 2027-2028 » alors que l'année en cours est « 2026-2027 », inscrivant
  // l'étudiant dans une année future et le laissant sans classe active.
  // Vide = année courante ; on ne remplit que pour viser une autre année.
  const [enroll, setEnroll] = useState({
    // Identifiant du compte CHOISI dans la liste, jamais une chaîne à résoudre
    // après coup : l'ancien code retombait sur `found.users[0]`, donc inscrivait
    // silencieusement le premier homonyme quand la saisie était ambiguë.
    studentId: '',
    className: '',
    academicYear: '',
  });
  const [enrolling, setEnrolling] = useState(false);

  // Recherche distante des comptes. Réutilise GET /accounts?q= (désormais
  // insensible aux accents côté serveur) — aucun endpoint créé pour l'occasion.
  const searchStudents = useCallback(async (q: string): Promise<ComboboxOption[]> => {
    const found = await api<{
      users: {
        id: string;
        email: string;
        matricule: string | null;
        firstName: string;
        lastName: string;
      }[];
    }>(`/accounts?limit=10${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`, {}, getToken());
    return found.users.map((u) => ({
      value: u.id,
      label: `${u.firstName} ${u.lastName}`,
      hint: u.matricule ? `${u.matricule} · ${u.email}` : u.email,
    }));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      setClasses(await api<SchoolClass[]>('/enrollment/classes', {}, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const created = await api<SchoolClass>(
        '/enrollment/classes',
        {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            label: form.label || undefined,
            level: form.level || undefined,
          }),
        },
        getToken(),
      );
      setNotice(`Classe « ${created.name} » créée.`);
      setForm({ name: '', label: '', level: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c: SchoolClass) {
    setConfirmDelete(null);
    setEditingId(c.id);
    setEditForm({ name: c.name, label: c.label ?? '', level: c.level ?? '' });
  }

  async function saveEdit(id: string) {
    setError(null);
    setNotice(null);
    try {
      await api(
        `/enrollment/classes/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: editForm.name,
            label: editForm.label || undefined,
            level: editForm.level || undefined,
          }),
        },
        getToken(),
      );
      setNotice('Classe mise à jour.');
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Modification impossible.');
    }
  }

  async function removeClass(id: string) {
    setError(null);
    setNotice(null);
    try {
      await api(`/enrollment/classes/${id}`, { method: 'DELETE' }, getToken());
      setNotice('Classe supprimée.');
      setConfirmDelete(null);
      if (openClassId === id) setOpenClassId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Suppression impossible.');
      setConfirmDelete(null);
    }
  }

  async function toggleEnrollments(id: string) {
    if (openClassId === id) {
      setOpenClassId(null);
      setDetail(null);
      return;
    }
    setOpenClassId(id);
    setDetail(null);
    setLoadingDetail(true);
    try {
      setDetail(await api<ClassDetail>(`/enrollment/classes/${id}`, {}, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement des inscriptions impossible.');
    } finally {
      setLoadingDetail(false);
    }
  }

  async function unenroll(enrollmentId: string, classId: string) {
    setError(null);
    setNotice(null);
    try {
      await api(`/enrollment/enrollments/${enrollmentId}`, { method: 'DELETE' }, getToken());
      setNotice('Étudiant désinscrit.');
      // Recharge le détail ouvert + les effectifs.
      const fresh = await api<ClassDetail>(`/enrollment/classes/${classId}`, {}, getToken());
      setDetail(fresh);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Désinscription impossible.');
    }
  }

  async function enrollStudent(event: FormEvent) {
    event.preventDefault();
    setEnrolling(true);
    setNotice(null);
    setError(null);
    try {
      // L'étudiant a été SÉLECTIONNÉ dans la liste : plus rien à deviner.
      if (!enroll.studentId) {
        setError('Choisissez un étudiant dans la liste.');
        return;
      }
      const student = { id: enroll.studentId };
      const result = await api<{ className: string; enrollment: { academicYear: string } }>(
        '/enrollment/enroll',
        {
          method: 'POST',
          body: JSON.stringify({
            userId: student.id,
            className: enroll.className,
            // Omis si vide : le serveur applique l'année courante.
            ...(enroll.academicYear ? { academicYear: enroll.academicYear } : {}),
          }),
        },
        getToken(),
      );
      // On affiche l'année RÉELLEMENT enregistrée, pas celle qu'on croyait
      // envoyer — c'est la seule qui compte pour retrouver l'inscription.
      setNotice(`Étudiant inscrit en ${result.className} (${result.enrollment.academicYear}).`);
      setEnroll({ ...enroll, studentId: '' });
      if (openClassId) await toggleEnrollmentsRefresh(openClassId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Inscription impossible.');
    } finally {
      setEnrolling(false);
    }
  }

  // Rafraîchit le panneau ouvert sans le refermer.
  async function toggleEnrollmentsRefresh(id: string) {
    try {
      setDetail(await api<ClassDetail>(`/enrollment/classes/${id}`, {}, getToken()));
    } catch {
      /* silencieux : le rechargement de la liste suffit */
    }
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">Classes &amp; filières</h1>
      <p className="mt-1 text-sm text-muted">
        Le nom technique (ex. L1_DROIT) est référencé par les règles d’accès aux
        collections et la liste des étudiants attendus.
      </p>

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      <Card className="mt-5">
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
            Nom technique
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="L1_DROIT"
              required
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
            Libellé
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Licence 1 Droit"
            />
          </label>
          <label className="flex w-24 flex-col gap-1.5 text-sm font-medium">
            Niveau
            <Input
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
              placeholder="L1"
            />
          </label>
          <Button type="submit" disabled={saving}>
            {saving ? 'Création…' : 'Créer la classe'}
          </Button>
        </form>
      </Card>

      {classes !== null && classes.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-serif text-lg font-bold">Inscrire un étudiant</h2>
          <p className="text-sm text-muted">
            Une inscription par étudiant et par année ; ré-inscrire le déplace de classe.
          </p>
          <form onSubmit={enrollStudent} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              Étudiant (matricule ou email)
              <Combobox
                id="enroll-student"
                value={enroll.studentId}
                onChange={(v) => setEnroll({ ...enroll, studentId: v })}
                onSearch={searchStudents}
                placeholder="Nom, email ou matricule"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Classe
              <Select
                value={enroll.className}
                onChange={(e) => setEnroll({ ...enroll, className: e.target.value })}
                required
                className="!w-auto"
              >
                <option value="" disabled>
                  Choisir…
                </option>
                {(classes ?? []).map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.label ? `${c.label} (${c.name})` : c.name}
                  </option>
                ))}
              </Select>
            </label>
            {/* Facultatif : vide = année courante, calculée par le serveur. */}
            <label className="flex w-40 flex-col gap-1.5 text-sm font-medium">
              Année
              <Input
                value={enroll.academicYear}
                onChange={(e) => setEnroll({ ...enroll, academicYear: e.target.value })}
                pattern="\d{4}-\d{4}"
                placeholder="année courante"
                title="Laisser vide pour l’année en cours. Ne renseigner que pour inscrire dans une autre année (ex. 2026-2027)."
              />
            </label>
            <Button type="submit" disabled={enrolling}>
              {enrolling ? 'Inscription…' : 'Inscrire'}
            </Button>
          </form>
        </Card>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-semibold">Nom technique</th>
              <th className="px-4 py-2.5 font-semibold">Libellé</th>
              <th className="px-4 py-2.5 font-semibold">Niveau</th>
              <th className="px-4 py-2.5 font-semibold">Étudiants actifs</th>
              <th className="px-4 py-2.5 font-semibold">Inscriptions</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {classes === null && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  {LIBELLES.commun.chargement}
                </td>
              </tr>
            )}
            {classes !== null && classes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  Aucune classe pour le moment.
                </td>
              </tr>
            )}
            {(classes ?? []).map((schoolClass) => {
              const isEditing = editingId === schoolClass.id;
              const isOpen = openClassId === schoolClass.id;
              return (
                <FragmentRow key={schoolClass.id}>
                  <tr className="border-b border-line">
                    {isEditing ? (
                      <>
                        <td className="px-4 py-2.5">
                          <Input
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            aria-label="Nom technique"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <Input
                            value={editForm.label}
                            onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                            aria-label="Libellé"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <Input
                            value={editForm.level}
                            onChange={(e) => setEditForm({ ...editForm, level: e.target.value })}
                            aria-label="Niveau"
                            className="w-20"
                          />
                        </td>
                        <td className="px-4 py-2.5">{schoolClass.activeStudents}</td>
                        <td className="px-4 py-2.5 text-muted">
                          {schoolClass._count.enrollments}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-2">
                            <Button onClick={() => saveEdit(schoolClass.id)}>Enregistrer</Button>
                            <Button variant="ghost" onClick={() => setEditingId(null)}>
                              Annuler
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 font-mono font-medium">
                          {schoolClass.name}
                        </td>
                        <td className="px-4 py-2.5">{schoolClass.label ?? '—'}</td>
                        <td className="px-4 py-2.5">{schoolClass.level ?? '—'}</td>
                        <td className="px-4 py-2.5">{schoolClass.activeStudents}</td>
                        <td className="px-4 py-2.5 text-muted">
                          {schoolClass._count.enrollments}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button variant="ghost" onClick={() => toggleEnrollments(schoolClass.id)}>
                              {isOpen ? 'Masquer' : 'Inscrits'}
                            </Button>
                            <Button variant="ghost" onClick={() => startEdit(schoolClass)}>
                              Éditer
                            </Button>
                            {confirmDelete === schoolClass.id ? (
                              <Button onClick={() => removeClass(schoolClass.id)}>
                                Confirmer ?
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                onClick={() => setConfirmDelete(schoolClass.id)}
                              >
                                Supprimer
                              </Button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-line bg-paper/50">
                      <td colSpan={6} className="px-4 py-3">
                        {loadingDetail && <p className="text-sm text-muted">Chargement…</p>}
                        {!loadingDetail && detail && detail.enrollments.length === 0 && (
                          <p className="text-sm text-muted">Aucun étudiant inscrit.</p>
                        )}
                        {!loadingDetail && detail && detail.enrollments.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            {detail.enrollments.map((en) => (
                              <div
                                key={en.id}
                                className="flex items-center justify-between rounded-md border border-line bg-white px-3 py-2"
                              >
                                <div className="text-sm">
                                  <span className="font-medium">
                                    {en.user.firstName} {en.user.lastName}
                                  </span>
                                  {en.user.matricule && (
                                    <span className="ml-2 font-mono text-xs text-muted">
                                      {en.user.matricule}
                                    </span>
                                  )}
                                  <span className="ml-2 text-xs text-muted">
                                    {en.academicYear}
                                  </span>
                                  <Badge tone={en.user.status === 'ACTIVE' ? 'green' : 'ocre'}>
                                    {en.user.status === 'ACTIVE' ? 'Actif' : en.user.status}
                                  </Badge>
                                </div>
                                <Button
                                  variant="ghost"
                                  onClick={() => unenroll(en.id, schoolClass.id)}
                                >
                                  Désinscrire
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Petit wrapper pour grouper la ligne principale et sa ligne dépliée sans
// <div> invalide dans un <tbody>.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
