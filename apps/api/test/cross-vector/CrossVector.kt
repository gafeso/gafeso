package com.gafeso.spikeb

/**
 * Point d'entrée du vecteur croisé TS→Kotlin. Compilé AVEC le VRAI
 * SegmentedBlobReader du lecteur mobile (Spike-B) — non modifié. Déchiffre un
 * blob AEAD segmenté produit par le module TS (backend) et vérifie qu'il ressort
 * bien un PDF (`%PDF-`). Preuve d'interopérabilité de format avant que le lecteur
 * mobile ne dépende du chiffrement serveur.
 *
 * arg[0] = chemin du blob .gafs. Émet `XVEC_OK …` sur succès, code ≠ 0 sinon.
 */
fun main(args: Array<String>) {
    val reader = SegmentedBlobReader(args[0], 16)
    val clear = reader.readRange(0L, reader.fileLen.toInt())
    val head = String(clear.copyOfRange(0, 5), Charsets.ISO_8859_1)
    if (head == "%PDF-") {
        println("XVEC_OK head=$head len=${clear.size} segs=${reader.nSegs} touched=${reader.touched.size}")
    } else {
        System.err.println("XVEC_FAIL head=$head")
        kotlin.system.exitProcess(2)
    }
}
