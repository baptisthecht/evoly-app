# Sécurité d'Evoly

Complément de la section 13 du cahier des charges : ce qui est en place, les exceptions assumées et ce qui reste à faire avant le lancement.

## Dépendances

- **Mises à jour** : la garde d'envoi affiche chaque semaine les nouvelles versions, installées après 14 jours (`docs/MAINTENANCE.md`) ; Dependabot ne propose plus que les mises à jour des actions GitHub (`.github/dependabot.yml`).
- **Vulnérabilités connues** : la garde d'envoi bloque toute faille modérée ou plus grave, dans toutes les dépendances (`pnpm audit --audit-level moderate`) ; la tâche `audit` de l'intégration continue fait échouer toute modification qui introduit une vulnérabilité élevée ou critique dans les dépendances de production (`pnpm audit --prod --audit-level high`).

### Exclusions justifiées

Depuis le 16 novembre 2026, quatre avis de node-forge, corrigés en 1.4.3 (publiée le 4 novembre 2026), qui ne peut être installée qu'à partir du 18 novembre (14 jours, `docs/MAINTENANCE.md`). Evoly n'utilise node-forge que pour signer les pass Apple Wallet (`apps/app/src/server/wallet/apple.ts` : lecture de son propre certificat et de sa propre clé, signature PKCS#7) ; aucun de ces avis ne touche ce code. À retirer en installant 1.4.3 le 18 novembre.

| Avis                         | Paquet             | Pourquoi il ne s'applique pas                                                                                                     | Retrait          |
| ---------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| GHSA-w4xr-hqv8-ch44 (modéré) | node-forge ≤ 1.4.2 | plantage du client TLS de forge (compression inconnue dans la réponse du serveur) : forge n'ouvre aucune connexion TLS dans Evoly | 18 novembre 2026 |
| GHSA-j8rw-jp99-435v (modéré) | node-forge ≤ 1.4.2 | plantage du client TLS de forge (message de poignée de main reçu sans session) : même raison                                      | 18 novembre 2026 |
| GHSA-6cv4-p8m7-4r25 (modéré) | node-forge ≤ 1.4.2 | expression régulière lente dans `forge.http` (en-têtes et cookies de réponse) : Evoly n'utilise pas `forge.http`                  | 18 novembre 2026 |
| GHSA-6889-vf6x-f3g5 (faible) | node-forge ≤ 1.4.2 | vérification de signatures Ed25519 : Evoly ne vérifie aucune signature avec forge                                                 | 18 novembre 2026 |

Les 9 avis de node-forge exclus jusqu'au 7 novembre 2026 ne visent plus la version installée, 1.4.2 : 8 sont corrigés depuis 1.4.1, le neuvième (GHSA-86w9-cpqp-85rv, vérification de signatures RSA) ne vise que les versions jusqu'à 1.4.0.

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
