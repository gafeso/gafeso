# Contribuer à Gafeso

Merci de l'intérêt porté à Gafeso. Ce dépôt est le cœur du projet open-source **Gafeso**,
édité par ResurgiTech, sous licence **AGPL-3.0**.

## Mise en place

```bash
git clone <url-du-depot> gafeso && cd gafeso
./install.sh          # provisionne la stack (Docker Compose) et génère les secrets
```

- Copiez `.env.example` vers `.env` pour le développement local (les valeurs par défaut
  fonctionnent sur la stack locale ; **ne les utilisez jamais en production** — le template de
  prod force des secrets générés).
- La suite de tests de l'API doit rester **verte** avant toute contribution.

## Conventions

- **Messages de commit en français**, clairs, à granularité fine (un bloc cohérent par commit).
- **Tests verts** avant tout commit.
- Ouvrez une **Pull Request** décrivant le quoi et le pourquoi. Pour un changement conséquent,
  ouvrez d'abord une **issue** pour discuter la direction.
- Respectez l'isolation **multi-établissements** : toute évolution du schéma ou des données doit
  préserver l'étanchéité entre tenants.

## Origine des contributions (DCO)

Ce projet utilise le **Developer Certificate of Origin** : en signant vos commits, vous
certifiez avoir le droit de soumettre votre code sous la licence du projet.

```bash
git commit -s        # ajoute "Signed-off-by: Nom <email>"
```

Toute contribution est acceptée sous **AGPL-3.0**.

## Sécurité

Ne signalez **jamais** une faille via une issue publique — suivez [`SECURITY.md`](SECURITY.md).

## Ce qui aide le plus

- Rapports de bugs reproductibles (étapes, environnement, logs pertinents).
- Améliorations d'interopérabilité (MARC, OAI-PMH, SRU) et d'accessibilité.
- Traductions et documentation de déploiement.
