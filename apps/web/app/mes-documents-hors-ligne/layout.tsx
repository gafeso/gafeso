import type { ReactNode } from 'react';

import { PiedCommun } from '@/components/pied-commun';

/**
 * ⚠ UNE COQUE PAR ÉCRAN DE L'ESPACE LECTEUR, et non un groupe de routes.
 *
 * Un `app/(lecteur)/` aurait été plus idiomatique — mais il DÉPLACE les
 * fichiers, et plusieurs tests de ce dépôt datent un écran par
 * `git log --diff-filter=A` pour savoir s'il relève d'une convention
 * postérieure au 10 septembre 2026. Un déplacement les ferait tous apparaître
 * comme neufs, et la discrimination s'effondrerait sans que le message le dise.
 *
 * Deux fichiers de quatre lignes coûtent moins que ça.
 */
export default function CoqueDeMesDocumentsHorsLigne({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <PiedCommun />
    </>
  );
}
