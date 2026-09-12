import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { RemindersService } from './reminders.service';

const config = { daysBefore: 2, overdueRepeatDays: 7, templatesRaw: null };
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

function service(overrides: { prisma?: any; mail?: any; modules?: any } = {}) {
  const prisma = overrides.prisma ?? {};
  // ⚠ `{ sent: true }` et non `undefined` : `MailService` rend une issue depuis
  // le 12 septembre 2026, et une doublure plus permissive que le service réel
  // rend le test aveugle là où le service décide.
  const mail =
    overrides.mail ?? { sendCirculationReminder: vi.fn().mockResolvedValue({ sent: true }) };
  // ⚠ P4-1 : l'activation des rappels vient du REGISTRE. La doublure rend
  // `true` par défaut — un test de planification ne doit pas échouer parce que
  // le module serait éteint, ce qui n'est pas son sujet.
  const modules = overrides.modules ?? { estActif: vi.fn().mockResolvedValue(true) };
  return new RemindersService(prisma as any, mail as any, modules as any);
}

describe('RemindersService — planification (planFor)', () => {
  const svc = service();

  it('échéance dans N jours → DUE_SOON (stageKey = date d’échéance)', () => {
    const plan = svc.planFor(day('2026-07-20'), config, day('2026-07-18'));
    expect(plan).toEqual({ type: 'DUE_SOON', stageKey: 'due:2026-07-20', joursRetard: 0 });
  });

  it('échéance au-delà de N jours → aucun rappel', () => {
    expect(svc.planFor(day('2026-07-25'), config, day('2026-07-18'))).toBeNull();
  });

  it('échéance aujourd’hui → DUE_SOON (0 jour, pas encore en retard)', () => {
    const plan = svc.planFor(day('2026-07-18'), config, day('2026-07-18'));
    expect(plan?.type).toBe('DUE_SOON');
    expect(plan?.joursRetard).toBe(0);
  });

  it('retard de 1 jour → OVERDUE palier 0 (relance J+1)', () => {
    const plan = svc.planFor(day('2026-07-17'), config, day('2026-07-18'));
    expect(plan).toEqual({ type: 'OVERDUE', stageKey: 'overdue:0', joursRetard: 1 });
  });

  it('retard de 8 jours (M=7) → OVERDUE palier 1 (J+1, puis +7)', () => {
    const plan = svc.planFor(day('2026-07-10'), config, day('2026-07-18'));
    expect(plan).toEqual({ type: 'OVERDUE', stageKey: 'overdue:1', joursRetard: 8 });
  });

  it('retards 1..7 → même palier 0 ; 8..14 → palier 1 (une relance par tranche de M)', () => {
    const stage = (overdueDays: number) =>
      svc.planFor(day('2026-07-01'), config, day(`2026-07-${String(1 + overdueDays).padStart(2, '0')}`))?.stageKey;
    expect(stage(1)).toBe('overdue:0');
    expect(stage(7)).toBe('overdue:0');
    expect(stage(8)).toBe('overdue:1');
    expect(stage(14)).toBe('overdue:1');
    expect(stage(15)).toBe('overdue:2');
  });
});

describe('RemindersService — idempotence & envoi (processReminder via runForTenant)', () => {
  /** Faux magasin reminder_logs avec contrainte unique en mémoire. */
  function makeStore() {
    const rows: any[] = [];
    const keyOf = (w: any) => {
      const k = w.checkoutId_type_stageKey;
      return `${k.checkoutId}|${k.type}|${k.stageKey}`;
    };
    return {
      rows,
      reminderLog: {
        findUnique: vi.fn(async ({ where }: any) => rows.find((r) => keyOf(where) === r._key) ?? null),
        create: vi.fn(async ({ data }: any) => {
          const _key = `${data.checkoutId}|${data.type}|${data.stageKey}`;
          if (rows.some((r) => r._key === _key)) {
            throw new Prisma.PrismaClientKnownRequestError('unique', {
              code: 'P2002',
              clientVersion: 'test',
            });
          }
          const row = { id: `log-${rows.length}`, _key, ...data };
          rows.push(row);
          return row;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const row = rows.find((r) => keyOf(where) === r._key);
          Object.assign(row, data);
          return row;
        }),
      },
    };
  }

  const checkout = (over: Partial<any> = {}) => ({
    id: 'co-1',
    dueDate: day('2026-07-20'),
    returnDate: null,
    item: { barcode: 'BC-001', record: { title: 'Les Soleils des indépendances' } },
    patron: { user: { email: 'awa@exemple.bf', firstName: 'Awa', lastName: 'Traoré' } },
    ...over,
  });

  function prismaWith(store: ReturnType<typeof makeStore>, checkouts: any[]) {
    return {
      ...store,
      tenantSettings: { findUnique: vi.fn().mockResolvedValue(null) },
      forTenant: vi.fn(() => ({ checkout: { findMany: vi.fn().mockResolvedValue(checkouts) } })),
    };
  }

  let store: ReturnType<typeof makeStore>;
  beforeEach(() => {
    store = makeStore();
  });

  it('premier passage : envoie et journalise SENT', async () => {
    const mail = { sendCirculationReminder: vi.fn().mockResolvedValue({ sent: true }) };
    const svc = service({ prisma: prismaWith(store, [checkout()]), mail });
    const r = await svc.runForTenant('t1', 'bibliotheque', day('2026-07-18'));
    expect(r.sent).toBe(1);
    expect(mail.sendCirculationReminder).toHaveBeenCalledTimes(1);
    expect(store.rows[0].status).toBe('SENT');
  });

  it('deuxième passage : AUCUN doublon (déjà SENT)', async () => {
    const mail = { sendCirculationReminder: vi.fn().mockResolvedValue({ sent: true }) };
    const svc = service({ prisma: prismaWith(store, [checkout()]), mail });
    await svc.runForTenant('t1', 'bibliotheque', day('2026-07-18'));
    await svc.runForTenant('t1', 'bibliotheque', day('2026-07-18'));
    expect(mail.sendCirculationReminder).toHaveBeenCalledTimes(1); // une seule fois
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].status).toBe('SENT');
  });

  it('⚠ SANS SMTP : journalise FAILED, PAS « SENT » — le mensonge était persisté', async () => {
    // LE défaut du 12 septembre 2026. `MailService` traitait « SMTP absent »
    // comme un envoi réussi : aucune exception, donc ce chemin marquait SENT et
    // comptait le rappel. Le mensonge ne vivait pas dans une réponse HTTP —
    // il était ÉCRIT dans `reminder_log`, puis AFFICHÉ dans les statistiques de
    // l'école. Un bibliothécaire lisait « rappels envoyés » pour des courriels
    // jamais partis, et les adhérents n'étaient jamais prévenus de leur retard.
    const mail = {
      sendCirculationReminder: vi.fn().mockResolvedValue({ sent: false, reason: 'smtp_absent' }),
    };
    const svc = service({ prisma: prismaWith(store, [checkout()]), mail });

    const r = await svc.runForTenant('t1', 'bibliotheque', day('2026-07-18'));

    expect(r.sent).toBe(0);
    expect(r.failed).toBe(1);
    expect(store.rows[0].status).toBe('FAILED');
    expect(store.rows[0].error).toContain('smtp_absent');
  });

  it('⚠ et il sera RETENTÉ : le jour où la messagerie est réglée, il part', async () => {
    // Conséquence assumée de marquer FAILED plutôt que SENT : tant que SMTP est
    // absent, le rappel revient à chaque passage. C'est le bon sens du
    // compromis — l'alternative est de mentir une fois pour toutes.
    const mail = {
      sendCirculationReminder: vi
        .fn()
        .mockResolvedValueOnce({ sent: false, reason: 'smtp_absent' })
        .mockResolvedValueOnce({ sent: true }),
    };
    const svc = service({ prisma: prismaWith(store, [checkout()]), mail });

    await svc.runForTenant('t1', 'bibliotheque', day('2026-07-18'));
    const r2 = await svc.runForTenant('t1', 'bibliotheque', day('2026-07-18'));

    expect(mail.sendCirculationReminder).toHaveBeenCalledTimes(2);
    expect(r2.sent).toBe(1);
    expect(store.rows[0].status).toBe('SENT');
  });

  it('échec SMTP : journalise FAILED, ne bloque pas, retenté au passage suivant', async () => {
    const mail = {
      sendCirculationReminder: vi
        .fn()
        // ⚠ REJET conservé EXPRÈS : le filet `catch` de `processReminder`
        // couvre encore l'inattendu, et il doit rester éprouvé. Le cas de la
        // panne SMTP ANNONCÉE (issue `smtp_error`) a son propre test plus bas.
        .mockRejectedValueOnce(new Error('SMTP down'))
        .mockResolvedValueOnce({ sent: true }),
    };
    const svc = service({ prisma: prismaWith(store, [checkout()]), mail });
    const r1 = await svc.runForTenant('t1', 'bibliotheque', day('2026-07-18'));
    expect(r1.failed).toBe(1);
    expect(store.rows[0].status).toBe('FAILED');
    // Nouveau passage → retente et réussit.
    const r2 = await svc.runForTenant('t1', 'bibliotheque', day('2026-07-18'));
    expect(r2.sent).toBe(1);
    expect(store.rows[0].status).toBe('SENT');
    expect(mail.sendCirculationReminder).toHaveBeenCalledTimes(2);
  });

  it('adhérent sans email : SKIPPED_NO_EMAIL, aucun envoi', async () => {
    const mail = { sendCirculationReminder: vi.fn() };
    const co = checkout({ patron: { user: { email: '', firstName: 'Sans', lastName: 'Email' } } });
    const svc = service({ prisma: prismaWith(store, [co]), mail });
    const r = await svc.runForTenant('t1', 'bibliotheque', day('2026-07-18'));
    expect(r.skippedNoEmail).toBe(1);
    expect(mail.sendCirculationReminder).not.toHaveBeenCalled();
    expect(store.rows[0].status).toBe('SKIPPED_NO_EMAIL');
  });

  it('prêt hors fenêtre : rien à envoyer', async () => {
    const mail = { sendCirculationReminder: vi.fn() };
    const co = checkout({ dueDate: day('2026-08-30') });
    const svc = service({ prisma: prismaWith(store, [co]), mail });
    const r = await svc.runForTenant('t1', 'bibliotheque', day('2026-07-18'));
    expect(r.processed).toBe(0);
    expect(mail.sendCirculationReminder).not.toHaveBeenCalled();
  });
});
