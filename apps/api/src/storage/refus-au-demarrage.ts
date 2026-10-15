import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { decisionDeCoherence, ECHAPPEMENT } from './coherence-au-demarrage';

/**
 * Mesure les deux nombres, puis applique la décision PURE.
 *
 * ⚠ La séparation n'est pas cosmétique : la décision s'éprouve sans base ni
 * stockage (voir `coherence-au-demarrage.spec.ts`), et cette fonction-ci ne
 * contient AUCUNE règle — seulement deux comptes et un `process.exit`.
 */
export async function refuserSiLeStockageEstVide(app: INestApplication): Promise<void> {
  const config = app.get(ConfigService);
  const prisma = app.get(PrismaService);
  const storage = app.get(StorageService);

  /**
   * ⚠ LES COPIES NUMÉRIQUES VIVENT DANS LES SCHÉMAS DES ÉCOLES, pas dans
   * `public` : il faut donc les PARCOURIR. Compter dans `public` rendrait
   * toujours zéro et le garde serait vert sur tout — « un garde qui ne lit pas
   * ce qu'il déclare ».
   */
  let documentsEnBase = 0;
  try {
    const ecoles = await prisma.tenant.findMany({ select: { slug: true } });
    for (const { slug } of ecoles) {
      documentsEnBase += await prisma.forTenant(slug).digitalCopy.count();
    }
  } catch (cause) {
    // ⚠ UNE BASE INJOIGNABLE N'EST PAS « ZÉRO DOCUMENT ». Si on comptait zéro
    // ici, le garde se taîrait précisément quand il ne peut pas mesurer — et un
    // garde qui ne peut pas mesurer n'est pas un garde qui passe.
    console.error('');
    console.error('🔴 REFUS DE DÉMARRER — impossible de compter les documents numériques.');
    console.error(`   ${(cause as Error)?.message ?? cause}`);
    console.error('');
    console.error('   Ce contrôle refuse plutôt que de supposer zéro : un comptage');
    console.error("   impossible ne dit pas qu'il n'y a rien.");
    console.error('');
    process.exit(1);
  }

  const objetsDansLeStockage = await storage.compterLesCopiesNumeriques();
  const decision = decisionDeCoherence({
    documentsEnBase,
    objetsDansLeStockage,
    echappement: config.get<string>(ECHAPPEMENT),
  });
  if (decision.demarre) return;

  console.error('');
  console.error('🔴 REFUS DE DÉMARRER');
  console.error('');
  for (const ligne of decision.message.split('\n')) console.error(`   ${ligne}`);
  console.error('');
  // ⚠ Code de sortie NON NUL : c'est lui que compose lit pour marquer le
  // service en échec. Un `return` laisserait l'API démarrer en ayant imprimé
  // un avertissement que personne ne lit.
  process.exit(1);
}
