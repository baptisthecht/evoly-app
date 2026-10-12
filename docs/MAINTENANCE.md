# Maintenance des dépendances

## Contrôles obligatoires avant chaque enregistrement

À chaque `git commit`, git lance `ops/precommit.sh`. L'enregistrement est **refusé** si la mise en forme des fichiers enregistrés, les types ou les tests (cœur, traductions, serveur de l'app) échouent. Les tests du serveur ont besoin d'une base PostgreSQL de test (`DATABASE_URL`, par défaut `postgresql://evoly:evoly@localhost:5432/evoly`).

Ces contrôles, comme ceux de l'envoi, ne se contournent jamais (`--no-verify` interdit).

## Contrôles obligatoires avant chaque envoi

À chaque `git push`, git lance `ops/prepush.sh` (installé par `pnpm install`, via simple-git-hooks). L'envoi est **bloqué** si :

1. `pnpm audit` trouve une faille **modérée ou plus grave** (les exceptions justifiées sont listées dans `docs/SECURITE.md`) ;
2. un fichier n'est pas formaté par **Prettier** (`pnpm format` corrige).
3. les **tests** échouent ou la **couverture** passe sous le seuil (`pnpm -r test`) ;
4. la **construction** de l'app ou les **parcours complets** échouent (`bash ops/e2e.sh`, exactement comme l'intégration continue).

Si l'envoi passe ces contrôles, l'intégration continue passe aussi.

Une fois par semaine, le même contrôle affiche les **nouvelles versions** (`ops/versions-check.mjs`).

## Migrer sans casser

1. **Âge minimal de 14 jours.** On n'installe jamais une version publiée depuis moins de 14 jours : une version piégée (attaque de la chaîne d'approvisionnement) est en général repérée et retirée dans ce délai. Jamais de version candidate (alpha, beta, rc).
2. **Mises à jour mineures** : appliquées ensemble, puis vérification complète (types, tests du cœur, des traductions et de l'app, construction). Enregistrées seulement si tout passe.
3. **Versions majeures** : une par une, notes de migration lues, code adapté, vérification complète, enregistrement séparé.
4. **Exceptions** : `@types/node` suit la version de Node du serveur (22) ; une majeure qui demande une réécriture importante (par exemple TypeScript 7) attend que l'écosystème (Next.js, Prisma) la prenne en charge.

## Dependabot

Les dépendances npm passent par la vérification hebdomadaire ci-dessus (âge minimal de 14 jours, majeures une par une) : Dependabot ne propose plus de mises à jour npm, qui contredisaient cette règle. Il garde les actions GitHub (`.github/dependabot.yml`), avec le même délai de 14 jours. Les alertes de sécurité de GitHub restent actives.

## Décisions en cours

| Dépendance                                         | Version          | Décision                                                              |
| -------------------------------------------------- | ---------------- | --------------------------------------------------------------------- |
| nodemailer                                         | 6.10.1 → 10.0.11 | Migrée le 12 octobre 2026 : 16 failles corrigées (6 élevées).         |
| prisma                                             | 8.0.0            | Version candidate seulement : on attend la version stable.            |
| typescript                                         | 7                | Réécriture du compilateur : on attend la prise en charge par Next.js. |
| @types/node                                        | 26               | Reste en 22, comme Node sur le serveur.                               |
| stripe, @stripe/stripe-js, @stripe/react-stripe-js | 23, 10, 7        | À migrer ensemble, avec un paiement de test complet.                  |
| vitest, @vitest/coverage-v8                        | 5                | À migrer ensemble.                                                    |
| dotenv, imapflow, @types/nodemailer                | 18, 2, 8         | À migrer une par une.                                                 |

## Couverture de tests

`pnpm test` mesure la couverture (cœur et code serveur de l'app) et échoue sous le seuil ; l'intégration continue le lance à chaque envoi.

**Cliquet** : après chaque série de tests ajoutés, les seuils sont relevés au niveau atteint ; ils ne sont jamais abaissés. Objectif : s'approcher de 100 %.

| Partie                                              | Instructions | Branches | Fonctions | Lignes | Mesuré le                                                                                                                                                                                |
| --------------------------------------------------- | ------------ | -------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cœur (`packages/core`)                              | 98,8 %       | 94,1 %   | 100 %     | 99,5 % | 12 octobre 2026                                                                                                                                                                          |
| Serveur de l'app (`apps/app/src/server`, `src/lib`) | 82,5 %       | 70,1 %   | 83,8 %    | 87,7 % | 12 octobre 2026, après les séries « argent et sécurité », « événements, tarifs, e-mails et finances », « équipe, questions, campagnes, back-office, domaines, marque, scanner, revente » |

Les écrans sont couverts par les parcours complets (Playwright, `apps/app/e2e`). `pnpm traceability` liste les règles du cahier des charges qu'aucun test ne cite : chaque nouveau test nomme la règle qu'il vérifie (par exemple « RG-POS-04 »).
