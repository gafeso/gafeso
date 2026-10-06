/**
 * LES SESSIONS DE L'ASSISTANT — en mémoire du processus, jamais en base.
 *
 * ⚠ POURQUOI EN MÉMOIRE, et c'est un choix qu'on pourrait croire paresseux :
 *
 * · elle MEURT avec le processus, donc rien ne survit à un redémarrage — c'est
 *   exactement le mode de panne que l'interdit sur les sessions fabriquées
 *   nomme : « un secret fabriqué survit à la session qui l'a créé » ;
 * · elle n'est pas dans la sauvegarde, donc une restauration ne ressuscite pas
 *   une session d'assistant ;
 * · et pendant une installation il y a UN processus api — il n'y a donc rien à
 *   partager.
 *
 * Le prix est connu et acceptable : un redémarrage de l'API pendant
 * l'installation oblige à ressaisir le jeton d'amorçage. On le DIT dans le
 * message de refus plutôt que de le laisser deviner.
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

const DUREE_MS = 30 * 60 * 1000;

@Injectable()
export class SessionAssistantService {
  private readonly logger = new Logger(SessionAssistantService.name);
  private readonly sessions = new Map<string, number>();

  ouvrir(): { session: string; expireLe: string } {
    this.purger();
    const session = randomBytes(32).toString('base64url');
    const expire = Date.now() + DUREE_MS;
    this.sessions.set(session, expire);
    // ⚠ On journalise le FAIT, jamais la valeur.
    this.logger.log('Session d’assistant d’installation ouverte (30 min).');
    return { session, expireLe: new Date(expire).toISOString() };
  }

  valide(session: string | undefined): boolean {
    if (!session) return false;
    const expire = this.sessions.get(session);
    if (expire === undefined) return false;
    if (expire < Date.now()) {
      this.sessions.delete(session);
      return false;
    }
    return true;
  }

  /** Toutes les sessions tombent quand l'installation se termine. */
  fermerToutes(): void {
    this.sessions.clear();
  }

  private purger(): void {
    const maintenant = Date.now();
    for (const [s, e] of this.sessions) if (e < maintenant) this.sessions.delete(s);
  }
}
