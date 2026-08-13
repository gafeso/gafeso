# Politique de sécurité

## Signaler une vulnérabilité

Merci de signaler toute faille de sécurité **en privé**, jamais via une issue ou une PR
publique.

- Écrivez à **security@gafeso.org**.
- Décrivez la vulnérabilité, son impact, et les étapes pour la reproduire.
- Indiquez si possible la version / le commit concerné.

Nous nous efforçons d'accuser réception rapidement et de vous tenir informé du traitement.
Merci de nous laisser un délai raisonnable pour corriger avant toute divulgation publique.

## Portées d'intérêt particulier

- **Isolation multi-établissements** : toute fuite de données entre tenants (accès au schéma
  d'un établissement depuis le contexte d'un autre).
- **Authentification et permissions** : contournement de rôle, élévation de privilège,
  faiblesse de la 2FA ou de la gestion de session.
- **Contrôle d'accès aux documents** : accès à un document sans droit, contournement du gating
  par classe / abonnement.
- **Modèle de lecture hors-ligne** : contournement du chiffrement au repos, extraction de la
  clé de contenu, falsification ou rejeu de licence, contournement de l'expiration ou de la
  révocation (voir la note d'architecture de sécurité dans `docs/`).

## Bonnes pratiques de déploiement

Gafeso génère des secrets forts à l'installation. Une instance qui réutiliserait les valeurs de
développement du template, exposerait MinIO/PostgreSQL publiquement, ou désactiverait le
reverse-proxy TLS sort du modèle de sécurité prévu — ces configurations relèvent de
l'exploitation, pas d'une vulnérabilité du logiciel.
