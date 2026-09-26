/**
 * LA REPRISE D'ACCÈS AU SUPER-ADMIN PLATEFORME — backlog n° 48.
 *
 * Le super-admin vit dans `public` et n'avait AUCUN chemin de reprise :
 * `PasswordToken` est par-tenant, donc le lien de définition — la mécanique
 * employée partout ailleurs — ne lui est pas applicable.
 *
 * ⚠ LA FORME FAUTIVE QUE CE PROBLÈME APPELLE, et elle PASSERAIT : créer un
 * `PasswordToken` dans `public`. La table y existe, donc l'écriture réussit —
 * mais l'écran `/definir-mot-de-passe` résout son tenant par le DOMAINE, et un
 * jeton de `public` n'y serait jamais trouvé. La personne lirait « Lien
 * invalide » sur un lien neuf : un faux dispositif complet.
 */
import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminService } from './admin.service';
import { ReinitialiserSuperAdminDto } from './dto/reinitialiser-super-admin.dto';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

function service(admin: { id: string; email: string; password: string } | null) {
  const update = vi.fn(async (_args: { data: { password: string } }) => ({}));
  const prisma = { superAdmin: { findUnique: vi.fn(async () => admin), update } } as any;
  const svc = new AdminService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { svc, update, prisma };
}

const EXISTANT = { id: 'sa-1', email: 'super@exemple.org', password: '$2a$10$ancien' };

describe('⚠ le DTO refuse ce qui ne doit pas passer', () => {
  it('sans `confirme`, c’est REFUSÉ — le geste invalide le mot de passe en service', async () => {
    await expect(
      pipe.transform({ email: 'super@exemple.org' }, { type: 'body', metatype: ReinitialiserSuperAdminDto }),
    ).rejects.toThrow();
  });

  it('`confirme: false` est refusé aussi — un booléen présent n’est pas un accord', async () => {
    await expect(
      pipe.transform(
        { email: 'super@exemple.org', confirme: false },
        { type: 'body', metatype: ReinitialiserSuperAdminDto },
      ),
    ).rejects.toThrow();
  });

  it('une adresse qui n’est pas une adresse est refusée', async () => {
    await expect(
      pipe.transform(
        { email: 'pas-une-adresse', confirme: true },
        { type: 'body', metatype: ReinitialiserSuperAdminDto },
      ),
    ).rejects.toThrow();
  });

  it('⚠ AUCUN mot de passe n’est accepté en entrée', async () => {
    // `forbidNonWhitelisted` refuse tout champ non déclaré : un opérateur qui
    // tenterait d'imposer une valeur se fait dire non, plutôt que de voir son
    // champ ignoré en silence.
    await expect(
      pipe.transform(
        { email: 'super@exemple.org', confirme: true, password: 'quelque-chose' },
        { type: 'body', metatype: ReinitialiserSuperAdminDto },
      ),
    ).rejects.toThrow();
  });

  it('témoin POSITIF : la forme juste passe', async () => {
    // Sans ce cas, les quatre refus ci-dessus seraient satisfaits par un DTO
    // qui refuse TOUT — et personne ne pourrait plus reprendre son accès.
    const v = await pipe.transform(
      { email: 'Super@Exemple.ORG', confirme: true },
      { type: 'body', metatype: ReinitialiserSuperAdminDto },
    );
    expect((v as ReinitialiserSuperAdminDto).confirme).toBe(true);
  });
});

describe('le service', () => {
  it('⚠ une adresse inconnue LÈVE, et n’écrit rien', async () => {
    const { svc, update } = service(null);
    await expect(svc.reinitialiserSuperAdmin('inconnu@exemple.org')).rejects.toThrow(NotFoundException);
    expect(update, 'aucune écriture sur un compte introuvable').not.toHaveBeenCalled();
  });

  it('⚠ il DIT que le compte n’existe pas — contrairement à la connexion', async () => {
    // `superAdminLogin` rend un message unique pour ne rien divulguer : son
    // appelant est un inconnu. Ici l'appelant porte la clé de plateforme, et il
    // a besoin de savoir s'il s'est trompé d'adresse.
    const { svc } = service(null);
    await expect(svc.reinitialiserSuperAdmin('inconnu@exemple.org')).rejects.toThrow(/inconnu@exemple\.org/);
  });

  it('l’adresse est normalisée avant la recherche', async () => {
    const { svc, prisma } = service(EXISTANT);
    await svc.reinitialiserSuperAdmin('  Super@Exemple.ORG  ');
    expect(prisma.superAdmin.findUnique).toHaveBeenCalledWith({
      where: { email: 'super@exemple.org' },
    });
  });

  it('⚠ le mot de passe est ENGENDRÉ, fort, et HACHÉ — jamais stocké en clair', async () => {
    const { svc, update } = service(EXISTANT);
    const r = await svc.reinitialiserSuperAdmin(EXISTANT.email);

    expect(r.motDePasse.length, 'trop court pour un compte de plateforme').toBeGreaterThanOrEqual(20);
    // ⚠ Le type de `vi.fn()` sans argument déclaré rend `calls` en tuple VIDE :
    // `calls[0][0]` est illégal pour `tsc`, et vitest le transpile sans broncher.
    // C'est la faute qui a fait découvrir que `test:base` ne lançait pas `tsc`.
    const appel = update.mock.calls[0] as unknown as [{ data: { password: string } }];
    const ecrit = appel[0].data.password;
    expect(ecrit, 'le haché doit être un bcrypt').toMatch(/^\$2[aby]\$/);
    expect(ecrit, 'le mot de passe ne doit JAMAIS être écrit en clair').not.toBe(r.motDePasse);
    expect(ecrit).not.toBe(EXISTANT.password);
  });

  it('⚠ deux appels ne rendent pas le même mot de passe', async () => {
    // Un générateur cassé — une graine fixe, une constante — rendrait deux fois
    // la même valeur, et rien d'autre ne le dirait.
    const a = await service(EXISTANT).svc.reinitialiserSuperAdmin(EXISTANT.email);
    const b = await service(EXISTANT).svc.reinitialiserSuperAdmin(EXISTANT.email);
    expect(a.motDePasse).not.toBe(b.motDePasse);
  });

  it('la réponse AVERTIT que la valeur ne sera pas réaffichée', async () => {
    const { svc } = service(EXISTANT);
    const r = await svc.reinitialiserSuperAdmin(EXISTANT.email);
    // Le texte porte une propriété, il ne se contente pas d'exister : sans
    // l'avertissement, l'opérateur ferme son terminal et perd la valeur.
    expect(r.avertissement).toMatch(/une fois/i);
    expect(r.avertissement).toMatch(/précédent ne fonctionne plus/i);
  });
});

describe('⚠ la forme FAUTIVE n’est pas dans le code', () => {
  it('le service ne crée AUCUN `passwordToken` pour un super-admin', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, 'admin.service.ts'), 'utf8');
    // On cherche la forme fautive dans la méthode de reprise, pas dans le
    // fichier entier — le commentaire la NOMME pour qu'on ne la refasse pas.
    const i = src.indexOf('async reinitialiserSuperAdmin');
    const j = src.indexOf('\n  async ', i + 10);
    const methode = src.slice(i, j > 0 ? j : undefined);
    expect(
      methode,
      'Un PasswordToken dans `public` PASSERAIT — la table y existe — et ' +
        'donnerait « Lien invalide » sur un lien neuf, parce que l’écran résout ' +
        'son tenant par le domaine.',
    ).not.toMatch(/passwordToken/i);
  });
});
