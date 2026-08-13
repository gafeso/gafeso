import { HttpStatus, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Refuse un téléversement trop volumineux AVANT de lire le corps.
 *
 * Pourquoi si tôt : si l'on laisse Multer découvrir le dépassement, il coupe
 * le flux entrant pendant que le client émet encore. La requête est alors
 * « avortée », le socket en cours de destruction — et la réponse d'erreur ne
 * peut plus être écrite. Le client recevait donc « Internal Server Error »,
 * quel que soit le soin apporté au filtre d'exception : celui-ci s'exécutait
 * bien (le journal le montrait) mais parlait dans le vide.
 *
 * En s'appuyant sur `Content-Length`, annoncé AVANT le corps, on répond
 * proprement 413 avec la limite, et le client sait quoi faire.
 *
 * Repli : si l'en-tête est absent (transfert par morceaux), on laisse passer
 * — Multer reste le garde-fou de dernier ressort.
 */
const LIMITS: { pattern: RegExp; mo: number }[] = [
  { pattern: /\/digital-copy$/, mo: 200 },
  { pattern: /\/import-marc$/, mo: 20 },
];

@Injectable()
export class UploadSizeMiddleware implements NestMiddleware {
  private readonly logger = new Logger(UploadSizeMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    // originalUrl, jamais req.path : selon le point de montage du middleware,
    // `path` peut être relatif au préfixe et ne plus correspondre au motif.
    const chemin = (req.originalUrl ?? req.url ?? '').split('?')[0];
    const limite = LIMITS.find((l) => l.pattern.test(chemin))?.mo;
    if (limite === undefined) return next();

    const annonce = Number(req.headers['content-length'] ?? 0);
    if (!annonce || annonce <= limite * 1024 * 1024) return next();

    const recuMo = Math.round(annonce / 1024 / 1024);
    this.logger.warn(
      `Téléversement refusé sur ${chemin} : ${recuMo} Mo annoncés, limite ${limite} Mo.`,
    );
    res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      message:
        `Fichier trop volumineux (environ ${recuMo} Mo) : la limite est de ${limite} Mo. ` +
        `Réduisez la taille du fichier (compression du PDF) ou découpez-le.`,
      error: 'Payload Too Large',
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
    });
  }
}
