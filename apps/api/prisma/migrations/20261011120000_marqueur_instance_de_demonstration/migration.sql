-- Marqueur « cette école est une instance de DÉMONSTRATION ».
--
-- Il n'existe que pour autoriser une destruction : il est l'une des TROIS
-- conditions cumulatives qui permettent à `remplacer-documents-demo.mjs`
-- d'écrire ailleurs que sur localhost. Aucun écran ne le lit.
--
-- ⚠ DÉFAUT `false`, et c'est la bonne direction d'échec : une école neuve, ou
-- une école oubliée par un rattrapage, REFUSE. Le défaut inverse ouvrirait la
-- destruction à qui n'a rien demandé.
--
-- ⚠ CETTE MIGRATION NE PORTE QUE CETTE COLONNE. `prisma migrate diff` en
-- proposait SEPT de plus — deux clés étrangères détruites puis recréées sur
-- `harvest_runs` / `harvested_records`, et trois index renommés. Mesuré : ces
-- sept-là sont ANTÉRIEURES à ce changement (diff du schéma de HEAD : 7
-- instructions ; avec ma colonne : 8). Les embarquer ici aurait fait prendre
-- des verrous sur des tables de production dans une migration dont le NOM dit
-- autre chose. Dette écrite au backlog.
ALTER TABLE "tenant_settings"
  ADD COLUMN "est_instance_de_demonstration" BOOLEAN NOT NULL DEFAULT false;
