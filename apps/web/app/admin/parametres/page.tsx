import { redirect } from 'next/navigation';

/**
 * Ancienne adresse du paramétrage — redirige vers l'identité de l'établissement.
 *
 * ⚠ ELLE NE DISPARAÎT PAS, ET C'EST DÉLIBÉRÉ. L'écran mêlait l'identité de
 * l'établissement et les règles de prêt ; il est scindé depuis le 11 septembre
 * 2026 (dette n° 2). Mais son adresse a circulé : signets, liens dans des notes,
 * peut-être un courriel à une école. Une adresse qui a existé et qui rend 404
 * dit au lecteur qu'il s'est trompé, alors que c'est nous qui avons déplacé.
 *
 * Vers l'ÉTABLISSEMENT et non vers les règles, parce que c'est ce que l'écran
 * montrait en premier — son titre était « Établissement ».
 */
export default function ParametresRedirection() {
  redirect('/admin/etablissement');
}
