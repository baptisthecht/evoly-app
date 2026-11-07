# Sécurité d'Evoly

Complément de la section 13 du cahier des charges : ce qui est en place, les exceptions assumées et ce qui reste à faire avant le lancement.

## Dépendances

- **Mises à jour** : la garde d'envoi affiche chaque semaine les nouvelles versions, installées après 14 jours (`docs/MAINTENANCE.md`) ; Dependabot ne propose plus que les mises à jour des actions GitHub (`.github/dependabot.yml`).
- **Vulnérabilités connues** : la garde d'envoi bloque toute faille modérée ou plus grave, dans toutes les dépendances (`pnpm audit --audit-level moderate`) ; la tâche `audit` de l'intégration continue fait échouer toute modification qui introduit une vulnérabilité élevée ou critique dans les dépendances de production (`pnpm audit --prod --audit-level high`).

### Exclusions justifiées

Aucune depuis le 7 novembre 2026, et `pnpm audit` ne trouve plus aucune faille, quel que soit son niveau. Les 9 avis de node-forge exclus jusque-là ne visent plus la version installée, 1.4.2 (`docs/MAINTENANCE.md`) : 8 sont corrigés depuis 1.4.1, le neuvième (GHSA-86w9-cpqp-85rv, vérification de signatures RSA) ne vise que les versions jusqu'à 1.4.0.

Toute nouvelle exclusion se déclare dans `package.json` (`pnpm.auditConfig.ignoreGhsas`) et s'explique ici, dans un tableau : avis, paquet, pourquoi il ne s'applique pas, date de retrait.

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
