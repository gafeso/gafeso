/**
 * ⚠ Le routeur de Next exige un `not-found.tsx` PAR SEGMENT : ce fichier
 * existe pour cette contrainte, et son contenu est partagé avec
 * `/opac/resoudre/<identifiant>`. C'est le CONTENU qui ne se recopie pas.
 */
export { IdentifiantIntrouvable as default } from '@/components/resolution-perenne';
