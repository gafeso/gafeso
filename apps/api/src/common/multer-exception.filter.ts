import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Response } from 'express';

/**
 * Traduit les erreurs de Multer en réponses compréhensibles.
 *
 * Sans ce filtre, dépasser la taille maximale remontait en **500 « Internal
 * Server Error »** : le bibliothécaire voyait une erreur serveur générique,
 * sans savoir que son fichier était trop gros ni quelle était la limite.
 * Vérifié en audit — un envoi de 21 Mo sur une route limitée à 20 Mo donnait
 * un 500 opaque. Sur une campagne de numérisation, c'est de l'assistance
 * inutile en série.
 *
 * On répond désormais **413 Payload Too Large** avec la limite ET la taille
 * réelle, pour que l'utilisateur sache quoi faire.
 */
interface MulterError extends Error {
  code?: string;
  /** Champ du formulaire concerné (renseigné par Multer). */
  field?: string;
}

/** Limites déclarées par route, pour pouvoir les CITER dans le message. */
const LIMIT_BY_PATH: { pattern: RegExp; mo: number }[] = [
  { pattern: /\/digital-copy$/, mo: 200 },
  { pattern: /\/import-marc$/, mo: 20 },
];

// Étend le filtre par défaut de Nest : tout ce que l'on ne sait pas traduire
// est délégué à `super.catch()`. Relancer l'exception depuis un filtre ne
// retomberait PAS sur le traitement standard — elle deviendrait une erreur non
// gérée, donc un 500 sans corps.
@Catch()
export class MulterExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(MulterExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{ url?: string; headers?: Record<string, string> }>();
    const err = exception as MulterError;

    const url = req?.url ?? '';
    const limite = LIMIT_BY_PATH.find((l) => l.pattern.test(url))?.mo;
    const recu = Number(req?.headers?.['content-length'] ?? 0);
    const recuMo = recu > 0 ? Math.round(recu / 1024 / 1024) : null;

    // Deux formes possibles du même incident :
    //  · LIMIT_FILE_SIZE — Multer a rejeté proprement ;
    //  · « Request aborted » — Multer a coupé le flux, le client continuait
    //    d'émettre, et Express signale l'abandon. C'est la forme observée en
    //    pratique, et elle remontait en 500 « Internal Server Error ».
    //
    // Un abandon peut AUSSI venir d'une vraie déconnexion du client. On ne
    // conclut donc au dépassement que si la route a une limite ET que
    // l'en-tête Content-Length annonce davantage : sinon on laisse le
    // traitement standard, pour ne pas masquer un incident réseau.
    const depassement =
      err?.code === 'LIMIT_FILE_SIZE' ||
      (/request aborted/i.test(err?.message ?? '') &&
        limite !== undefined &&
        recu > limite * 1024 * 1024);

    if (depassement) {

      const message =
        `Fichier trop volumineux` +
        (recuMo ? ` (environ ${recuMo} Mo)` : '') +
        (limite ? ` : la limite est de ${limite} Mo.` : '.') +
        ` Réduisez la taille du fichier (compression du PDF) ou découpez-le.`;

      this.logger.warn(`Téléversement refusé (trop volumineux) sur ${url} : ${recu} octets.`);
      res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        message,
        error: 'Payload Too Large',
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      });
      return;
    }

    if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(HttpStatus.BAD_REQUEST).json({
        message: `Champ de fichier inattendu${err.field ? ` (« ${err.field} »)` : ''}.`,
        error: 'Bad Request',
        statusCode: HttpStatus.BAD_REQUEST,
      });
      return;
    }

    // Tout le reste garde le traitement standard de Nest : ce filtre ne doit
    // PAS avaler les erreurs qu'il ne sait pas traduire.
    super.catch(exception, host);
  }
}
