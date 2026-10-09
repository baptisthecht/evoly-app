# Sécurité d'Evoly

Complément de la section 13 du cahier des charges : ce qui est en place, les exceptions assumées et ce qui reste à faire avant le lancement.

## Dépendances

- **Mises à jour** : Dependabot propose chaque mois les mises à jour des dépendances et des actions GitHub (`.github/dependabot.yml`), mineures et correctifs regroupés.
- **Vulnérabilités connues** : la tâche `audit` de l'intégration continue fait échouer toute modification qui introduit une vulnérabilité élevée ou critique dans les dépendances de production (`pnpm audit --prod --audit-level high`).

### Exclusions justifiées

| Avis                | Paquet                               | Pourquoi il ne s'applique pas                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GHSA-86w9-cpqp-85rv | node-forge (aucune version corrigée) | La faille concerne la **vérification** de signatures RSA PKCS#1 v1.5. Evoly utilise node-forge uniquement pour **signer** les pass Apple Wallet (`apps/app/src/server/wallet/apple.ts`) et ne vérifie jamais de signature avec. À retirer dès qu'une version corrigée existe. |

Toute nouvelle exclusion se déclare dans `package.json` (`pnpm.auditConfig.ignoreGhsas`) et s'explique dans ce tableau.

## Journaux sans données personnelles (RG-RGPD-03)

Les erreurs sont journalisées par `safeError()` (`apps/app/src/lib/redact.ts`) : message seul, jamais l'objet complet, adresses e-mail et numéros masqués. L'erreur enregistrée avec chaque webhook Stripe en échec est masquée de la même façon.

## Mesures en place

Authentification par Better Auth (mots de passe hachés en scrypt, vérification d'e-mail, limitation des tentatives, double authentification), fonction d'autorisation unique `can()`, politique de sécurité du contenu et en-têtes de sécurité, cookies `HttpOnly`, `Secure` et `SameSite`, limitation de débit, jetons aléatoires stockés hachés, webhooks signés et idempotents, journal d'audit.

## Avant le lancement : test d'intrusion externe

À confier à un prestataire indépendant (CDC section 13.1). Périmètre proposé :

- **Application organisateur** (`app.evoly.me`) : authentification et double authentification, cloisonnement entre organisations, rôles et permissions, actions serveur, exports, imports de contacts.
- **Billetterie publique** (sous-domaines et domaines personnalisés) : réservation et paiement, codes promo et de prévente, revente, « retrouver mes billets », liens magiques, protection anti-robots.
- **Scanner** (`scanner.evoly.me`) : liens bénévoles, validation des billets, fonctionnement hors ligne.
- **Points d'entrée techniques** : webhooks Stripe et e-mails, tâches planifiées, téléversement de fichiers.

Hors périmètre : Stripe, Resend et l'hébergeur, testés par leurs propres soins.
