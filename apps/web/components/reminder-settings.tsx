'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Alert, Button, Card, Input, Textarea } from '@/components/ui';

interface Template {
  subject: string;
  body: string;
}
interface ReminderVariable {
  token: string;
  description: string;
}
interface ReminderSettingsData {
  enabled: boolean;
  daysBefore: number;
  overdueRepeatDays: number;
  templates: { dueSoon: Template; overdue: Template };
  defaults: { dueSoon: Template; overdue: Template };
  variables: ReminderVariable[];
  smtpConfigured: boolean;
}

type TplKey = 'dueSoon' | 'overdue';
const TITLES: Record<TplKey, string> = {
  dueSoon: 'Rappel d’échéance (avant la date de retour)',
  overdue: 'Relance de retard (après la date de retour)',
};

export function ReminderSettings() {
  const [data, setData] = useState<ReminderSettingsData | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [daysBefore, setDaysBefore] = useState(2);
  const [overdueRepeatDays, setOverdueRepeatDays] = useState(7);
  const [templates, setTemplates] = useState<Record<TplKey, Template>>({
    dueSoon: { subject: '', body: '' },
    overdue: { subject: '', body: '' },
  });
  const [preview, setPreview] = useState<Record<TplKey, { subject: string; body: string } | null>>({
    dueSoon: null,
    overdue: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<ReminderSettingsData>('/reminders/settings', {}, getToken());
      setData(res);
      setEnabled(res.enabled);
      setDaysBefore(res.daysBefore);
      setOverdueRepeatDays(res.overdueRepeatDays);
      setTemplates({ dueSoon: res.templates.dueSoon, overdue: res.templates.overdue });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setTpl(key: TplKey, field: keyof Template, value: string) {
    setTemplates((t) => ({ ...t, [key]: { ...t[key], [field]: value } }));
    setPreview((p) => ({ ...p, [key]: null })); // l'aperçu devient obsolète
  }

  async function doPreview(key: TplKey) {
    setError(null);
    try {
      const res = await api<{ subject: string; body: string }>(
        '/reminders/preview',
        {
          method: 'POST',
          body: JSON.stringify({
            type: key === 'overdue' ? 'OVERDUE' : 'DUE_SOON',
            subject: templates[key].subject,
            body: templates[key].body,
          }),
        },
        getToken(),
      );
      setPreview((p) => ({ ...p, [key]: res }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Aperçu impossible.');
    }
  }

  function resetToDefault(key: TplKey) {
    if (!data) return;
    setTpl(key, 'subject', data.defaults[key].subject);
    setTemplates((t) => ({ ...t, [key]: { ...data.defaults[key] } }));
    setPreview((p) => ({ ...p, [key]: null }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api(
        '/reminders/settings',
        {
          method: 'PATCH',
          body: JSON.stringify({ enabled, daysBefore, overdueRepeatDays, templates }),
        },
        getToken(),
      );
      setNotice('Paramètres de rappels enregistrés.');
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return <p className="mt-3 text-sm text-muted">Chargement des notifications…</p>;
  }

  return (
    <Card className="mt-5">
      <h2 className="font-serif text-lg font-bold">Notifications de circulation</h2>
      <p className="mt-1 text-sm text-muted">
        Rappels d’échéance et relances de retard envoyés automatiquement par email.
      </p>

      {notice && <Alert tone="success" className="mt-3">{notice}</Alert>}
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      {!data.smtpConfigured && (
        <Alert tone="warning" className="mt-3">
          Aucun serveur SMTP n’est configuré : les emails seront journalisés (non
          envoyés) tant que le SMTP n’est pas en place.
        </Alert>
      )}

      <label className="mt-4 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="font-medium">Activer les rappels automatiques</span>
          <span className="mt-0.5 block text-muted">
            La tâche quotidienne enverra rappels et relances aux adhérents concernés.
          </span>
        </span>
      </label>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Rappel d’échéance : combien de jours avant (N)
          <Input
            type="number"
            min={0}
            max={30}
            value={daysBefore}
            onChange={(e) => setDaysBefore(Number(e.target.value))}
            className="max-w-[8rem]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Relance de retard : tous les combien de jours (M)
          <Input
            type="number"
            min={1}
            max={90}
            value={overdueRepeatDays}
            onChange={(e) => setOverdueRepeatDays(Number(e.target.value))}
            className="max-w-[8rem]"
          />
        </label>
      </div>

      <div className="mt-4 rounded-md border border-line bg-paper px-3 py-2 text-xs text-muted">
        <span className="font-medium text-ink">Variables disponibles :</span>{' '}
        {data.variables.map((v) => (
          <code key={v.token} className="mr-2 inline-block" title={v.description}>
            {v.token}
          </code>
        ))}
      </div>

      {(['dueSoon', 'overdue'] as TplKey[]).map((key) => (
        <div key={key} className="mt-5 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{TITLES[key]}</h3>
            <button
              type="button"
              onClick={() => resetToDefault(key)}
              className="text-xs text-ocre underline"
            >
              Rétablir le modèle par défaut
            </button>
          </div>
          <label className="mt-2 flex flex-col gap-1.5 text-sm font-medium">
            Sujet
            <Input
              value={templates[key].subject}
              onChange={(e) => setTpl(key, 'subject', e.target.value)}
            />
          </label>
          <label className="mt-2 flex flex-col gap-1.5 text-sm font-medium">
            Corps du message
            <Textarea
              rows={6}
              value={templates[key].body}
              onChange={(e) => setTpl(key, 'body', e.target.value)}
            />
          </label>
          <div className="mt-2">
            <Button variant="ghost" onClick={() => doPreview(key)}>
              Aperçu
            </Button>
          </div>
          {preview[key] && (
            <div className="mt-2 rounded-md border border-line bg-paper p-3 text-sm">
              <p className="font-semibold">{preview[key]!.subject}</p>
              <p className="mt-1 whitespace-pre-wrap text-muted">{preview[key]!.body}</p>
            </div>
          )}
        </div>
      ))}

      <div className="mt-5">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer les notifications'}
        </Button>
      </div>
    </Card>
  );
}
