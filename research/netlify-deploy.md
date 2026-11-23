# TanStack Start + Postgres sur Netlify : état des lieux

> Ticket : [#7](https://github.com/Arcades2/tanstack-starter/issues/7) — carte [#1](https://github.com/Arcades2/tanstack-starter/issues/1).
> Recherche du 2026-11-23. Versions npm relevées ce jour : `@tanstack/react-start` 1.169.7, `@netlify/vite-plugin-tanstack-start` 1.3.19 (dépend de `@netlify/vite-plugin` 3.0.1), `netlify-cli` 27.20.1, `@netlify/database` 2.0.3, `drizzle-orm` 0.45.4 (`latest`) / 1.0.0-rc.6 (`rc`) / 1.0.0-beta.22 (`beta`), `prisma` 8.0.0-rc.35 (`latest`) / 7.10.1 (`prev`).

## En bref

- **Déploiement** : on utilise le plugin Vite officiel `@netlify/vite-plugin-tanstack-start` avec `netlify()` dans `vite.config.ts`, plus `netlify.toml` (`vite build` et publication de `dist/client`). Le SSR, les server functions, les server routes et le middleware partent dans **une seule Netlify Function Node** (`/*`, `preferStatic`). Le SSR en Edge est possible mais facultatif, et ce n'est pas le comportement par défaut.
- **Limites des functions** : 60 s en synchrone, 1024 Mo de mémoire par défaut (jusqu'à 4 Go en Pro), 6 Mo de payload en mode bufferisé et 20 Mo en streaming, région par défaut `cmh` (Ohio).
- **Postgres** : **Netlify Database** est GA depuis le 28/04/2026. C'est du Postgres managé (moteur Neon), avec une branche par deploy preview et des migrations SQL appliquées par la plateforme. Ce choix **favorise nettement Drizzle**, qui a un adaptateur natif `drizzle-orm/netlify-db` et génère ses migrations dans le dossier que Netlify applique. Prisma fonctionne via la chaîne de connexion, mais **sans le pipeline de migrations** de la plateforme, et Prisma 8 est encore en RC.
- **Alternatives** : Neon en direct ou Supabase. Dans les deux cas il faut utiliser l'URL **poolée en mode transaction** au runtime et l'URL directe pour les migrations.

## 1. Déployer TanStack Start sur Netlify

### Plugin et configuration

Depuis TanStack Start 1.132.0, la méthode officielle est le plugin Vite `@netlify/vite-plugin-tanstack-start` ([Netlify docs](https://docs.netlify.com/build/frameworks/framework-setup-guides/tanstack-start/), [TanStack hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)) :

```ts
// vite.config.ts
import netlify from "@netlify/vite-plugin-tanstack-start";
plugins: [tanstackStart(), viteReact(), netlify()]; // TanStack : « anywhere in the array is fine »
```

```toml
# netlify.toml
[build]
  command = "vite build"
  publish = "dist/client"
[dev]
  command = "vite dev"
  port = 3000
```

Les anciennes méthodes (`tanstackStart({ target: 'netlify' })` pour les versions 1.121 à 1.131, puis `app.config.ts`/vinxi) sont obsolètes ([Netlify docs](https://docs.netlify.com/build/frameworks/framework-setup-guides/tanstack-start/)). Pour un déploiement avec la CLI, il faut `netlify-cli` ≥ 17.31.

Ce que fait le plugin (lu dans le code publié, `@netlify/vite-plugin@3.0.1`, `dist/main.js`) :

- **Au build**, il écrit `.netlify/v1/functions/server.mjs`, qui réexporte le `fetch` de l'entrée serveur avec `config = { path: "/*", preferStatic: true }`. Les fichiers statiques de `dist/client` passent donc en priorité, et tout le reste va dans une Netlify Function unique.
- **Option `edgeSSR`** (`@netlify/vite-plugin-tanstack-start`, `main.d.ts`) : « Deploy SSR handler to Netlify Edge Functions instead of Netlify Functions (default: false) ».
- **En dev**, `vite dev` émule la plateforme : functions, edge functions, Blobs, **Netlify Database**, variables d'environnement, redirects/headers, Image CDN. Il n'y a plus besoin de `netlify dev` ([Netlify docs](https://docs.netlify.com/build/frameworks/framework-setup-guides/tanstack-start/)). Le plugin se désactive quand `NETLIFY_DEV` est défini, pour éviter un doublon avec `netlify dev`.

> **Remarque sur cafe-de-toulouse** : dans son `vite.config.ts`, `netlify()` est **commenté**, alors que le paquet est installé (^1.2.15) et que `netlify.toml` publie `dist/client`. D'après le code ci-dessus, sans le plugin aucune function SSR n'est générée. Je n'ai pas vérifié comment ce site se déploie réellement. Le starter doit activer le plugin.

### Serverless (Functions) ou Edge

| | Netlify Functions (défaut) | Edge Functions (`edgeSSR: true`) |
|---|---|---|
| Runtime | Node (version du build, repli sur Node 24) | Deno |
| Durée | **60 s** en synchrone, 60 s en streaming | **50 ms de CPU** par requête, 40 s max avant les en-têtes de réponse |
| Mémoire | 1024 Mo par défaut, jusqu'à 4096 Mo (Pro, plans à crédits) | 512 Mo pour l'ensemble des edge functions |
| Payload | 6 Mo bufferisé (≈ 4,5 Mo en binaire, à cause du base64), 20 Mo en streaming | taille du code : 20 Mo compressé |
| Région | `cmh` (Ohio) par défaut, modifiable par site | réseau edge |

Sources : [Functions configuration](https://docs.netlify.com/build/functions/configuration/), [Functions API (streaming)](https://docs.netlify.com/build/functions/api/), [Usage & billing](https://docs.netlify.com/build/functions/usage-and-billing/), [Edge Functions limits](https://docs.netlify.com/build/edge-functions/limits/).

**Recommandation** : garder le défaut (Functions Node), pour trois raisons. better-auth, les ORM et le driver `pg` sont pensés pour Node. Le plafond de 50 ms de CPU en Edge est serré pour du SSR React. Enfin, une base Postgres dans une seule région annule l'intérêt de l'edge. Il faut aussi **aligner la région des functions sur celle de la base** : Netlify Database prend par défaut la région des functions du site ([API Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database/api/)).

Les Background Functions (15 min) et les Scheduled Functions (30 s) existent ([Background Functions](https://docs.netlify.com/build/functions/background-functions/)), mais les jobs sont hors périmètre (#1).

**À surveiller** : **Netlify Server** est en *Early Access*. C'est un serveur Node longue durée qui scale à zéro et qui garde les pools de connexions et les WebSockets entre les requêtes ([docs](https://docs.netlify.com/build/server/)). Le plugin TanStack ne le cible pas aujourd'hui, mais ce serait la réponse naturelle au problème du pooling en serverless.

### Variables d'environnement

- Elles se règlent dans l'UI, la CLI ou l'API, avec des **scopes** (Builds, Functions, Runtime, Post processing) et **une valeur par contexte de déploiement** (production, deploy preview, branch deploy, dev local). Une clé fait 255 caractères maximum et une valeur 5 000 ([overview](https://docs.netlify.com/build/environment-variables/overview/)).
- La limite AWS de 4 Ko au total ne concerne **que** le mode « Lambda compatibility ». Le handler moderne généré par le plugin ne l'utilise pas ([functions env vars](https://docs.netlify.com/build/functions/environment-variables/)).
- Avec le plugin Vite, les variables Netlify sont injectées dans `vite dev`. Côté TanStack Start, le serveur lit `process.env` au runtime, et seules les variables `VITE_*` sont inlinées dans le client au build. Une validation t3-env séparant `server` et `client` convient à ce modèle.
- `NETLIFY_DB_URL` est fournie automatiquement (builds, functions, edge) quand Netlify Database est actif ([tooling](https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/)).

## 2. Hébergement Postgres

### Netlify Database (option native)

- **GA le 28/04/2026** ([changelog](https://www.netlify.com/changelog/2026-04-28-netlify-database/)). Postgres managé « built into the Netlify platform », sur un moteur Neon ([docs](https://docs.netlify.com/build/data-and-storage/netlify-database/)).
- **Provisioning** : il est automatique dès que `@netlify/database` est dans les dépendances. Sans ce paquet, il faut créer la base à la main dans l'UI ([tooling](https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/)).
- **Branches** : seule la production accède à la base principale. Chaque deploy preview (et chaque agent run) reçoit **une branche copiée des données de prod**, ce qui veut dire que des PII se retrouvent dans les previews ([docs](https://docs.netlify.com/build/data-and-storage/netlify-database/), [skill Netlify](https://github.com/netlify/context-and-tools/blob/main/skills/netlify-database/SKILL.md)). En local, il n'y a pas de branche : `vite dev` ou `netlify dev` lancent un Postgres local, et le paquet `@netlify/database-dev` fournit une base en mémoire pour Vitest.
- **Migrations natives** : ce sont des fichiers SQL dans `netlify/database/migrations/`, au format `<nombre>_<slug>.sql` ou `<nombre>_<slug>/migration.sql`, triés lexicographiquement. Sur une preview, elles s'appliquent à chaque deploy. En production, elles s'appliquent juste avant la publication, et un échec bloque la publication. Netlify vérifie leur checksum : une migration déjà appliquée ne doit plus être modifiée ([migrations](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/)).
- **Outil de migration tiers** : c'est possible, mais à condition d'utiliser **un autre dossier**. Il faut alors appliquer soi-même les migrations sur les branches de preview, par exemple dans la commande de build. Surtout, **il n'existe pas de hook de publication** pour la production : il faut un processus hors bande, avec des migrations rétrocompatibles ([migrations](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/#manual-migrations)).
- **Client** : `getDatabase()` choisit le connecteur selon le runtime. Il expose `db.sql` (Waddler) et `db.pool` (un `pg.Pool`, nécessaire pour les transactions). `getConnectionString()` permet de brancher n'importe quel driver ([API](https://docs.netlify.com/build/data-and-storage/netlify-database/api/)). `@netlify/database` dépend à la fois de `pg` et de `@neondatabase/serverless`.
- **Prix et limites** : la base n'est disponible que sur les **plans à crédits**. La compute coûte 10 crédits par unité et la bande passante 20 crédits par Go. Le stockage est « currently free » d'après la doc, mais l'annonce GA parlait d'une gratuité « until July 1, 2026 », donc ce point est à confirmer. Plan Free : 3 bases, 20 branches, 1 CU max, 48 CU par mois, 5 Go de stockage, mise en veille après 5 min. Plan Personal : 5 bases, 100 branches, 4 CU max, 100 Go ([billing & limits](https://docs.netlify.com/build/data-and-storage/netlify-database/billing-and-usage/)). La base n'est certifiée ni PCI-DSS ni HIPAA par défaut.
- **Ancienne extension** : `@netlify/neon` et `NETLIFY_DATABASE_URL` sont obsolètes. Il ne faut pas écrire de nouveau code avec ([skill Netlify](https://github.com/netlify/context-and-tools/blob/main/skills/netlify-database/SKILL.md)).

### Neon en direct

C'est le même moteur, mais on gère soi-même le compte, les branches et les variables. Le pooler s'obtient avec l'hôte `-pooler` : c'est PgBouncer en **mode transaction**, jusqu'à 10 000 connexions client. En mode poolé, il n'y a pas de `SET` de session, de `LISTEN/NOTIFY` ni de `PREPARE` SQL. Les prepared statements au niveau du protocole fonctionnent avec PgBouncer ≥ 1.22. La connexion **directe** sert aux migrations ([Neon pooling](https://neon.com/docs/connect/connection-pooling)).

### Supabase

Il y a trois façons de se connecter ([Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)) :

- **Directe** (5432) : en IPv6, ou en IPv4 avec l'add-on payant.
- **Supavisor en mode session** (5432) : en IPv4.
- **Supavisor en mode transaction** (**6543**) : c'est le mode recommandé pour le serverless. Le client se crée une fois au niveau du module, avec un pool de 1. Ce mode **ne supporte pas les prepared statements** : il faut désactiver `prepare` côté driver.

Un pooler PgBouncer dédié est disponible à partir du plan Pro. Supabase apporte beaucoup de choses qui ne nous servent pas ici (auth, storage, realtime), puisque l'auth est better-auth.

### Pooling en serverless (règles communes)

- Instancier le client ou le pool **au niveau du module**, hors du handler, pour le réutiliser entre les invocations à chaud. Ne pas appeler `$disconnect()` en fin de requête.
- Garder un `max` de pool petit, car chaque instance de function a son propre pool. Au total, cela fait taille du pool × nombre d'instances ([Prisma, connexions](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)).
- Au runtime, passer par un pooler en mode transaction (Neon `-pooler`, Supavisor 6543). Pour les migrations et la CLI de l'ORM, utiliser l'URL directe.
- **Netlify Database** : la doc ne dit pas si `NETLIFY_DB_URL` passe par un pooler. `getDatabase()` est présenté comme « automatically configured and optimized for where your code is running », mais il faut le vérifier avant de dimensionner.

## 3. Contraintes propres à chaque ORM

### Drizzle

- **Intégration native avec Netlify Database** : `import { drizzle } from "drizzle-orm/netlify-db"`. La connexion se configure toute seule et suit automatiquement la branche de preview ([tooling](https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/)).
- **Migrations** : il faut mettre `out: "netlify/database/migrations"` dans `drizzle.config.ts`, sinon le dossier par défaut `drizzle` n'est **jamais appliqué**. Ensuite, `drizzle-kit generate` produit le SQL, on le commit, et Netlify l'applique au deploy. On garde ainsi le pipeline natif complet : previews, puis application avant publication.
- **Version** : Netlify demande `drizzle-orm@beta` et `drizzle-kit@beta` (la 1.0 approche). L'export `netlify-db` existe dans les versions 1.0.0-beta.22 à 1.0.0-rc.6 (j'ai vérifié dans le tarball rc.6), mais **pas dans la 0.45.x** (`latest`). Cela contredit l'objectif de #1 d'épingler des versions stables : il faudrait épingler une RC ou attendre la 1.0.
- Avec Neon ou Supabase en direct : `drizzle-orm/node-postgres`, ou `postgres-js` avec `prepare: false` derrière Supavisor en mode transaction.

### Prisma

- **Aucune intégration Netlify Database** documentée. Il faut passer par `getConnectionString()` ou `NETLIFY_DB_URL` avec un driver adapter. En Prisma 7, les exemples de la doc utilisent tous un adaptateur (`@prisma/adapter-pg`, comme dans cafe-de-toulouse), et le pool se règle sur l'adaptateur (`max`), plus via l'URL ([Prisma](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)).
- **Migrations** : les migrations Prisma (avec `_prisma_migrations` et `migration_lock.toml`) doivent rester **en dehors** de `netlify/database/migrations`. On perd alors l'application automatique sur les previews (il faut lancer `prisma migrate deploy` dans la commande de build, qui voit `NETLIFY_DB_URL` de la branche) et sur la prod (pas de hook de publication, donc un processus hors bande). Une autre voie serait de générer du SQL brut (`migrate diff`) dans le dossier Netlify, mais rien ne la documente.
- **Versions** : `npm i prisma` installe aujourd'hui **Prisma 8 en RC** (`latest` = 8.0.0-rc.35). Cette CLI « does not read `schema.prisma` and has no `generate`, `migrate dev`, or `db push` commands », et la librairie Postgres devient `@prisma/orm-postgres` (Node ≥ 22.18 ou 24.11). Prisma 7 sera maintenu 18 mois après la GA de Prisma 8, qui n'a pas encore de date ([release status](https://prisma.io/docs/orm/release-status?view=full)). Pour rester en 7, il faut épingler `prisma@^7` et `@prisma/client@^7`. La doc ne dit rien du pooling ni du runtime de Prisma 8.
- Netlify propose aussi une extension **Prisma Postgres**, qui fournit `DATABASE_URL` et `DATABASE_URL_POOLED` ([changelog](https://www.netlify.com/changelog/prisma-postgres-extension/)) : c'est une autre base que Netlify Database.

## 4. Conséquences pour le starter

1. Activer `netlify()` (plugin TanStack) dans `vite.config.ts` et ajouter `netlify.toml` avec `vite build` et `dist/client`. Garder le SSR en Functions Node, pas en Edge.
2. Si l'on retient **Netlify Database**, Drizzle est le choix le plus cohérent (adaptateur natif, migrations appliquées par la plateforme, branches de preview sans configuration). Le prix à payer est l'épinglage d'une 1.0 RC.
3. Si l'on retient **Prisma**, il vaut mieux choisir Neon ou Supabase avec un pooler en mode transaction, `prisma migrate deploy` en CI ou au build, et épingler Prisma 7 tant que la 8 est en RC.
4. Points à trancher ailleurs : le dev local (Postgres embarqué de Netlify ou docker-compose), la base de test en CI (`@netlify/database-dev` en mémoire ou un service Postgres), et la gestion des PII dans les branches de preview.

## Lacunes et incertitudes

- La doc ne précise pas si `NETLIFY_DB_URL` est poolée, ni quelle est la stratégie de connexion exacte de `getDatabase()` dans une Netlify Function.
- La date à partir de laquelle le stockage de Netlify Database devient payant est contradictoire : « currently free » dans la doc, « until July 1, 2026 » dans l'annonce GA.
- Le runtime, le pooling et le format de migrations de Prisma 8 ne sont pas documentés dans les pages consultées.
- Je n'ai pas fait de déploiement réel : les comportements du plugin viennent de la doc et du code publié sur npm.
