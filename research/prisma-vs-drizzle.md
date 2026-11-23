# Prisma ou Drizzle pour le starter

Ticket de recherche : [#2](https://github.com/Arcades2/tanstack-starter/issues/2). La décision se prend dans le ticket grilling [#14](https://github.com/Arcades2/tanstack-starter/issues/14).
Contexte : starter TanStack Start, déployé sur Netlify, Postgres, better-auth, Valibot.
État au **23 novembre 2026**, vérifié dans les docs officielles, les changelogs, les releases GitHub et les dist-tags npm.

## TL;DR

- **Les deux ORM sont en transition majeure.** Prisma 8 est une réécriture complète, encore en RC. Drizzle 1.0 est aussi en RC, mais l'API change bien moins.
- **Prisma est le plus risqué des deux aujourd'hui.** `npm install prisma` installe déjà la RC de Prisma 8. Cette CLI ne lit plus `schema.prisma` et n'a plus `generate` ni `migrate dev`. L'adapter better-auth ne supporte pas encore Prisma 8. Un starter Prisma devrait donc épingler Prisma 7, qui passe en fin de vie 18 mois après la GA de Prisma 8.
- **Netlify pousse Drizzle.** Netlify Database documente Drizzle comme seul ORM avec un support de première classe (`drizzle-orm/netlify-db`). Les migrations Drizzle Kit sont écrites là où Netlify les applique à chaque deploy et deploy preview.
- **Valibot est intégré à Drizzle.** En 1.0, c'est le sous-chemin `drizzle-orm/valibot`. Côté Prisma, il n'existe que des générateurs communautaires, sans support confirmé pour Prisma 7.

## 1. Où en sont les versions (novembre 2026)

| | Prisma | Drizzle |
|---|---|---|
| Stable | `prisma@prev` / `@prisma/client@latest` = **7.10.1** | `drizzle-orm@latest` = **0.45.4**, `drizzle-kit@latest` = 0.31.11 |
| Pré-version | `prisma@latest` = **8.0.0-rc.35** (sic : `latest` pointe sur une RC) | `drizzle-orm@rc` = **1.0.0-rc.6** (20 nov.) |
| Nature du saut | Réécriture complète en TypeScript (ex-« Prisma Next ») : nouveaux packages (`@prisma/orm-postgres`), nouvelle API de requêtes, migrations en graphe | Évolution : RQB v2, validateurs intégrés, refonte de drizzle-kit. Les schémas de tables restent les mêmes |

Sources : dist-tags npm (`npm view prisma dist-tags`, `npm view drizzle-orm dist-tags`, consultés le 23/11/2026), [Prisma release status](https://prisma.io/docs/orm/release-status?view=full), [Prisma changelog](https://www.prisma.io/changelog), [releases drizzle-orm](https://github.com/drizzle-team/drizzle-orm/releases).

Points clés sur Prisma, d'après la [page release status](https://prisma.io/docs/orm/release-status?view=full) :

- La page avertit que « `npm install prisma` and `npx prisma` now give you the Prisma ORM 8 command-line tool, which does not read `schema.prisma` and has no `generate`, `migrate dev`, or `db push` commands ».
- Prisma 8 n'a pas encore `$extends`, le filtrage dans les colonnes JSON, l'`increment` atomique, la plupart des nested writes, ni les codes d'erreur de type `P2002`.
- Prisma 7 reçoit correctifs et patchs de sécurité pendant **18 mois après la GA de Prisma 8**. La GA était visée pour octobre 2026 et n'a pas eu lieu.
- Prisma 6 n'est plus maintenu depuis le 19/11/2026.
- Prisma 8 demande Node 22.18+ ou 24.11+, et TypeScript 5.9+.
- L'annonce de la réécriture est dans le billet [The next evolution of Prisma ORM](https://prisma.io/blog/the-next-evolution-of-prisma-orm) (4 mars 2026). Il précise : « Prisma 7 remains the recommended version for production ».

Conséquence pour un starter : choisir Prisma aujourd'hui revient à **démarrer sur Prisma 7 en sachant qu'une migration vers Prisma 8 viendra**. Cette migration change l'API de requêtes, les packages et la CLI, et elle touchera toutes les apps dérivées. Démarrer directement sur Prisma 8 n'est pas possible tant que better-auth ne le supporte pas (voir §5).

Côté Drizzle, le saut 0.x → 1.0 est plus léger, mais **1.0 n'est pas encore stable**. La doc Valibot comme la doc Netlify demandent d'installer le tag `rc`/`beta`. Le starter devrait donc épingler une RC de 1.0 ou rester sur 0.45 et migrer plus tard.

## 2. Typesafety et DX

**Prisma 7**

- Le schéma est déclaratif, en PSL (`schema.prisma`).
- Il faut une étape `prisma generate`. Le client est généré dans le code source (`output` obligatoire avec le générateur `prisma-client`, voir l'[adapter better-auth Prisma](https://www.better-auth.com/docs/adapters/prisma)).
- L'API orientée modèles (`findMany`, `include`, nested writes) est très lisible. Les types sont générés, donc l'inférence reste rapide.
- Inconvénients : il faut régénérer le client après chaque changement de schéma, et le client généré fait partie de l'arborescence du projet.

**Drizzle**

- Le schéma est écrit en TypeScript (`pgTable(...)`) et les types sont inférés directement, sans étape de génération.
- Deux API cohabitent : un query builder proche du SQL et l'API relationnelle (`db.query.x.findMany({ with })`). En 1.0, RQB v2 remplace RQB v1, qui a été retiré de Postgres dès la rc.1 ([releases](https://github.com/drizzle-team/drizzle-orm/releases)).
- Le schéma est du code : on peut le partager, le composer et le réutiliser pour la validation (§6).
- Inconvénient : il faut savoir lire du SQL. Sur de très gros schémas, l'inférence peut peser sur le serveur TypeScript (non mesuré ici).

**Prisma 8**, pour mémoire : le contrat s'écrit en PSL ou en TypeScript et l'API devient `db.orders.where(...).include(...).all()`, avec un builder SQL typé en plus ([billet](https://prisma.io/blog/the-next-evolution-of-prisma-orm)). Prisma 8 se rapproche donc de Drizzle sur le plan conceptuel.

## 3. Migrations

| | Prisma 7 | Drizzle Kit |
|---|---|---|
| Génération | `prisma migrate dev` (SQL généré, dossiers `<timestamp>_<name>/migration.sql`) | `drizzle-kit generate` (fichiers SQL) |
| Application | `prisma migrate deploy` | `drizzle-kit migrate`, ou le migrator à l'exécution |
| Prototypage | `prisma db push` | `drizzle-kit push` |
| Garde-fous | Prisma 8 ajoute une confirmation avant les drops et la détection de renommage ([changelog 2026-10-09](https://www.prisma.io/changelog)) | Détection de conflits et contrôles de commutativité en 1.0 ([releases](https://github.com/drizzle-team/drizzle-orm/releases)) |

**Lien avec Netlify Database**

Netlify Database applique automatiquement les migrations SQL de `netlify/database/migrations`. Elles passent juste avant la publication d'un deploy de production et à chaque deploy preview, et chaque preview a sa propre branche de base ([doc migrations](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/)). Les noms doivent suivre le motif `<number>_<slug>`, en fichier `.sql` seul ou en dossier contenant `migration.sql`.

- Drizzle : la [doc tooling Netlify](https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/) indique explicitement de régler `out: "netlify/database/migrations"` dans `drizzle.config.ts`. L'intégration est documentée de bout en bout.
- Prisma : la doc Netlify n'en parle pas. Le format `<timestamp>_<name>/migration.sql` correspond *a priori* au format « sous-dossier ». Mais `migration_lock.toml` et la table `_prisma_migrations` ne sont pas pris en compte. C'est **non vérifié** et demanderait un test. L'autre option est de désactiver le système de Netlify et de lancer `prisma migrate deploy` dans le build.

## 4. Perf et taille de bundle en serverless sur Netlify

- **Prisma 7** n'a plus de moteur Rust : le client utilise par défaut un query compiler en WebAssembly et un driver adapter JS (`@prisma/adapter-pg`) (v7.0.0, 19/11/2025, [changelog](https://www.prisma.io/changelog)). L'option `compilerBuild = "fast" | "small"` (v7.3.0) choisit entre vitesse et taille. Le changelog ne donne aucun chiffre. La v7.4.0 ajoute une couche de cache.
- **Drizzle** est une couche TypeScript fine au-dessus du driver (`pg`, `postgres`, ou l'adapter `drizzle-orm/netlify-db`), sans WASM ni génération.
- **Ordre de grandeur indicatif** (taille décompressée des packages npm, ce qui n'est **pas** la taille du bundle) : `@prisma/client@7.10.1` ≈ 74 Mo, qui embarque plusieurs builds du compilateur ; `drizzle-orm@1.0.0-rc.6` ≈ 5 Mo. Après tree-shaking, la fonction Drizzle reste nettement plus légère. Aucune mesure de cold start n'a été faite ici.
- **Connexions** : la [page Prisma « Deploy to Netlify »](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-netlify) (v7) rappelle le risque d'épuiser les connexions en serverless et recommande un pooler (Prisma Postgres). La question est la même pour Drizzle. Netlify Database fournit `NETLIFY_DB_URL` et `getConnectionString()`.
- **Edge Functions** : Netlify Database est accessible depuis les Edge Functions ([doc](https://docs.netlify.com/build/data-and-storage/netlify-db/)). Pour Drizzle, l'adapter `netlify-db` est prévu pour ça. Pour Prisma 7, la page Netlify ne dit rien de l'edge.

## 5. Intégration better-auth

better-auth est en version stable `1.7.27`. Les deux adapters sont des packages officiels versionnés avec lui (`@better-auth/drizzle-adapter` et `@better-auth/prisma-adapter`).

- **Drizzle** ([doc](https://www.better-auth.com/docs/adapters/drizzle)) :
  - `drizzleAdapter(db, { provider: "pg" })` branche l'adapter ;
  - `npx auth@latest generate` produit le schéma Drizzle, puis `drizzle-kit generate` et `drizzle-kit migrate` créent et appliquent la migration ;
  - les jointures (`advanced.database.joins`, depuis 1.4) sont supportées ;
  - un sous-chemin `@better-auth/drizzle-adapter/relations-v2` existe pour RQB v2 ;
  - attention aux `relationName` quand plusieurs FK pointent vers la même table.
- **Prisma** ([doc](https://www.better-auth.com/docs/adapters/prisma)) :
  - le guide cible **Prisma 7** avec `@prisma/adapter-pg` et un `output` personnalisé ;
  - il prévient explicitement que l'adapter ne supporte pas encore Prisma 8, que `prisma` peut se résoudre sur la RC 8, et qu'il faut donc **épingler la version 7** ;
  - le CLI better-auth génère le schéma et l'utilisateur lance ensuite `prisma migrate dev` puis `prisma generate`.

Les deux options marchent. Côté Prisma, la contrainte de version pèse plus lourd.

## 6. Intégration Valibot

- **Drizzle** : `drizzle-orm/valibot` fait partie de `drizzle-orm` 1.0 ([doc](https://orm.drizzle.team/docs/valibot)). Il fournit `createSelectSchema`, `createInsertSchema` et `createUpdateSchema`, avec des raffinements par colonne. Pour Drizzle 0.45, il faut passer par l'ancien package séparé `drizzle-valibot@0.4.2`. Le sous-dossier `valibot/` est bien présent dans le tarball `drizzle-orm@1.0.0-rc.6`. On obtient donc un seul schéma, qui sert de source pour les types et pour la validation des formulaires et des server functions.
- **Prisma** : il n'y a pas d'intégration officielle. Des générateurs communautaires existent, comme `prisma-valibot-generator` (qui annonce Prisma 6.12+, sans mention de Prisma 7) et `hekireki` ([recherche npm/pkgstats](https://www.pkgstats.com/pkg:prisma-valibot-generator)). Sinon, il faut écrire les schémas Valibot à la main.

## 7. Seed

- **Prisma 7** : la commande se déclare dans `prisma.config.ts` (`migrations.seed`) et se lance avec `npx prisma db seed`. Le seed automatique après `migrate dev` et `migrate reset` a été **supprimé** en v7 ([doc seeding v7](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding)). Il n'y a pas de générateur de données : on écrit le script soi-même.
- **Drizzle** : il n'y a pas de commande de seed intégrée, on écrit un script TS. Le package officiel `drizzle-seed` (0.3.1 stable, versions `rc` alignées sur 1.0) génère des données factices **déterministes** à partir d'une graine. Il propose `.refine()` pour personnaliser les colonnes, les comptes et les relations, et `reset()` pour vider les tables, avec `TRUNCATE ... CASCADE` sur Postgres ([doc](https://orm.drizzle.team/docs/seed-overview)).

## 8. Studio

- **Prisma Studio** est inclus dans la CLI de Prisma 7 (`npx prisma studio`). Prisma 7 ne charge plus `.env` tout seul, il faut ajouter `import "dotenv/config"` dans la config. **La CLI de Prisma 8 n'a pas de commande `studio`** : il faut passer par `npx prisma@prev studio --url=...` ([doc](https://www.prisma.io/docs/orm/tools/prisma-studio)).
- **Drizzle Studio** se lance avec `drizzle-kit studio`. L'interface est servie depuis `local.drizzle.studio` et parle à un serveur local sur `127.0.0.1:4983`. Elle est gratuite en local mais **pas open source**. Safari et Brave bloquent localhost par défaut, ce qui oblige à passer par mkcert. Une version Gateway auto-hébergeable existe aussi ([doc](https://orm.drizzle.team/docs/drizzle-kit-studio)).

## 9. Maturité

- **Prisma** existe depuis longtemps, avec un gros écosystème et une doc fournie. Mais la gamme est fragmentée en ce moment : la v6 est en fin de vie, la v7 est stable mais condamnée à terme, et la v8 est en RC avec une API différente et des fonctions manquantes. L'éditeur pousse aussi ses produits commerciaux (Prisma Postgres, Compute) dans la doc et la CLI (`prisma bootstrap`, `prisma postgres link`).
- **Drizzle** est encore en 0.x stable, avec une 1.0 en RC depuis avril 2026 (rc.1 le 30/04, rc.6 le 20/11). Le développement est très actif. Le partenariat avec Netlify est visible : l'adapter `netlify-db` existe, et un dist-tag `netlify-constructor` apparaît sur npm.
- **Écosystème autour du starter** : better-auth supporte bien les deux. Netlify Database ne documente que Drizzle comme intégration de première classe.

## 10. Coût de bascule plus tard

- Dans les deux sens, le schéma doit être réécrit (PSL ↔ TS) et **toutes les requêtes** doivent être réécrites, puisque les API n'ont rien en commun. Une couche d'accès aux données isolée (repositories ou modules par domaine) limite les dégâts. C'est à voir avec le ticket d'architecture.
- **Les données et l'historique SQL survivent** : les deux outils produisent du SQL Postgres standard. On peut repartir d'une baseline avec introspection (`drizzle-kit pull`, ou `prisma db pull`).
- Les schémas d'auth se régénèrent avec le CLI better-auth pour l'un ou l'autre adapter.
- **Un coût de bascule est déjà connu côté Prisma** : passer de Prisma 7 à Prisma 8 change la CLI, les packages et l'API de requêtes, même s'il existe des « upgrade recipes » ([release status](https://prisma.io/docs/orm/release-status?view=full)). Côté Drizzle, le passage de 0.45 à 1.0 touche surtout l'API relationnelle (RQB v2) et les imports des validateurs.

## Ce qui reste à vérifier

- Mesurer la taille réelle des fonctions Netlify et le cold start (TanStack Start build → `.netlify/functions`) avec Prisma 7 (`compilerBuild = "small"`) et avec Drizzle.
- Vérifier si Netlify Database accepte un dossier de migrations Prisma, et comment il traite le dossier `meta/` de drizzle-kit 0.x par rapport à 1.0.
- Suivre la date de GA de Drizzle 1.0 et de Prisma 8, ainsi que le support de Prisma 8 par better-auth.

## Recommandation (indicative, la décision revient à l'humain dans #14)

Sur les critères du ticket, **Drizzle ressort en tête pour ce starter**, pour quatre raisons :

- l'intégration Netlify Database est documentée de bout en bout (adapter, migrations appliquées par deploy et par preview) ;
- Valibot est intégré officiellement (`drizzle-orm/valibot`), avec un seul schéma comme source de vérité ;
- il n'y a ni génération de client ni WASM, donc des fonctions plus légères ;
- Prisma est en pleine bascule de v7 à v8, ce qui imposerait aux apps dérivées une migration lourde à court terme.

Si Drizzle est retenu, il reste à choisir entre **épingler `drizzle-orm@1.0.0-rc.x`**, comme le recommandent Netlify et la doc Valibot, ou partir sur la 0.45 stable avec `drizzle-valibot` et migrer à la GA de la 1.0.

Prisma reste défendable si l'équipe tient à son API orientée modèles et à Prisma Studio, à condition d'**épingler `prisma@^7` et `@prisma/client@^7`** et d'accepter de migrer vers Prisma 8 dans les 18 mois qui suivent sa GA.

C'est une recommandation de recherche, pas une décision : le choix se fait dans le ticket grilling [#14](https://github.com/Arcades2/tanstack-starter/issues/14).
