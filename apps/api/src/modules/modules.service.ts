import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MODULES,
  MODULES_PAR_ID,
  ModuleDeclare,
  dependantsDe,
} from './registre-modules';

/** Pourquoi un module n'est pas basculable — sous forme EXPLOITABLE. */
export interface MotifVerrouillage {
  /** `noyau` · `dependance_manquante` · `requis_par` */
  code: 'noyau' | 'dependance_manquante' | 'requis_par';
  /** Les modules concernés — identifiants ET libellés, pour composer la phrase. */
  modules: { id: string; libelle: string }[];
}

export interface EtatModule extends Omit<ModuleDeclare, 'ecrans' | 'motifEcrans'> {
  /**
   * Ce qui disparaît, en phrases prêtes à afficher.
   *
   * ⚠ COMPOSÉ depuis la déclaration STRUCTURÉE, et c'est ce qui permet d'avoir
   * une seule source : la déclaration est vérifiable (chemins de pages réels),
   * la réponse reste `string[]` — donc l'écran livré ne change pas.
   */
  ecrans: string[];
  actif: boolean;
  /** Verrouillé : l'écran ne doit pas proposer de le basculer. */
  verrouille: boolean;
  /**
   * Pourquoi il est verrouillé, en une phrase affichable.
   *
   * ⚠ DÉPRÉCIÉE, et le front l'a signalé avant moi : c'est un TEXTE VISIBLE
   * rendu par l'API, contraire à la convention du dépôt (« tout texte affiché
   * passe par un fichier de libellés »). Elle reste pour ne pas casser l'écran
   * livré, mais `motif` ci-dessous porte la même information sous forme
   * exploitable — le jour d'une seconde langue, c'est lui qu'il faut lire.
   */
  motifVerrouillage: string | null;
  /**
   * La même raison, en ÉLÉMENTS. Le front compose la phrase avec ses propres
   * libellés, au lieu de recevoir du français d'une API.
   */
  motif: MotifVerrouillage | null;
}

@Injectable()
export class ModulesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Modules DÉSACTIVÉS d'un établissement.
   *
   * ⚠ TOLÈRE UNE VALEUR MALMENÉE et rend une liste vide — donc « tout actif ».
   * Une colonne JSON éditée à la main ne doit pas éteindre le produit : le
   * défaut sûr d'un registre est l'ouverture, parce qu'un module éteint par
   * accident retire des écrans sans que personne comprenne pourquoi.
   */
  async desactives(tenantId: string): Promise<string[]> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { modulesDesactives: true },
    });
    const brut = settings?.modulesDesactives;
    if (!Array.isArray(brut)) return [];
    return brut.filter((v): v is string => typeof v === 'string' && MODULES_PAR_ID.has(v));
  }

  /** Un seul module est-il actif ? Utilisé par le garde et par le planificateur. */
  async estActif(tenantId: string, moduleId: string): Promise<boolean> {
    const declare = MODULES_PAR_ID.get(moduleId);
    if (!declare) return false; // fail-closed : un module inconnu n'est pas actif
    if (declare.noyau) return true;
    return !(await this.desactives(tenantId)).includes(moduleId);
  }

  /** L'état complet, pour l'écran d'activation et pour le front. */
  async etat(tenantId: string): Promise<EtatModule[]> {
    const eteints = new Set(await this.desactives(tenantId));
    const actif = (id: string) => {
      const d = MODULES_PAR_ID.get(id);
      return d ? d.noyau || !eteints.has(id) : false;
    };

    const decrire = (ids: string[]) =>
      ids.map((id) => ({ id, libelle: MODULES_PAR_ID.get(id)?.libelle ?? id }));

    return MODULES.map((m) => {
      const estActif = actif(m.id);
      let motif: string | null = null;
      let structure: MotifVerrouillage | null = null;

      if (m.noyau) {
        motif = 'Requis — ce module ne se désactive pas.';
        structure = { code: 'noyau', modules: [] };
      } else {
        // Dépendance manquante : on ne peut pas l'allumer (décision 6).
        const manquantes = m.dependances.filter((d) => !actif(d));
        if (manquantes.length > 0) {
          const libelles = manquantes.map((d) => MODULES_PAR_ID.get(d)?.libelle ?? d);
          motif = `Nécessite : ${libelles.join(', ')} (désactivé).`;
          structure = { code: 'dependance_manquante', modules: decrire(manquantes) };
        } else {
          // Un module dont un AUTRE dépend et qui est allumé : verrouillé.
          const dependants = dependantsDe(m.id).filter((d) => actif(d));
          if (estActif && dependants.length > 0) {
            const libelles = dependants.map((d) => MODULES_PAR_ID.get(d)?.libelle ?? d);
            motif = `Requis par : ${libelles.join(', ')}.`;
            structure = { code: 'requis_par', modules: decrire(dependants) };
          }
        }
      }

      const { motifEcrans: _motif, ecrans, ...reste } = m;
      return {
        ...reste,
        ecrans: ecrans.map((e) => e.quoi),
        actif: estActif,
        verrouille: motif !== null,
        motifVerrouillage: motif,
        motif: structure,
      };
    });
  }

  /**
   * Active ou désactive un module pour UN établissement.
   *
   * ⚠ AUCUNE DONNÉE N'EST SUPPRIMÉE (décision 5). Cette méthode n'écrit qu'une
   * liste d'identifiants : les amendes dues, l'historique des rappels et les
   * notices exposées restent intacts, et une réactivation les retrouve tels
   * quels.
   *
   * ⚠ ET LE REFUS EST CÔTÉ API, pas seulement côté écran. L'interface
   * verrouille les lignes non basculables, mais un appel direct doit être
   * refusé — sinon le verrouillage n'est qu'une décoration.
   */
  async changerActivation(tenantId: string, moduleId: string, actif: boolean) {
    const declare = MODULES_PAR_ID.get(moduleId);
    if (!declare) {
      throw new NotFoundException(
        `Module « ${moduleId} » inconnu. Modules déclarés : ${MODULES.map((m) => m.id).join(', ')}.`,
      );
    }
    if (declare.noyau) {
      throw new BadRequestException(
        `Le module « ${declare.libelle} » fait partie du noyau : il ne se désactive pas. ` +
          'Authentification, usagers, catalogue, circulation et administration sont requis.',
      );
    }

    const eteints = new Set(await this.desactives(tenantId));

    if (actif) {
      // Allumer exige que ses dépendances soient allumées.
      const manquantes = declare.dependances.filter((d) => {
        const dep = MODULES_PAR_ID.get(d);
        return dep ? !dep.noyau && eteints.has(d) : true;
      });
      if (manquantes.length > 0) {
        throw new BadRequestException(
          `Le module « ${declare.libelle} » nécessite : ` +
            `${manquantes.map((d) => MODULES_PAR_ID.get(d)?.libelle ?? d).join(', ')}. ` +
            'Activez-les d’abord.',
        );
      }
      eteints.delete(moduleId);
    } else {
      // Éteindre exige que rien d'allumé n'en dépende.
      const dependants = dependantsDe(moduleId).filter((d) => {
        const dep = MODULES_PAR_ID.get(d);
        return dep ? dep.noyau || !eteints.has(d) : false;
      });
      if (dependants.length > 0) {
        throw new BadRequestException(
          `Le module « ${declare.libelle} » est requis par : ` +
            `${dependants.map((d) => MODULES_PAR_ID.get(d)?.libelle ?? d).join(', ')}. ` +
            'Désactivez-les d’abord.',
        );
      }
      eteints.add(moduleId);
    }

    await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: { modulesDesactives: [...eteints] },
      create: { tenantId, modulesDesactives: [...eteints] },
    });
    return this.etat(tenantId);
  }
}
