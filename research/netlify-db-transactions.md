# Transactions interactives avec l'adapter Drizzle de Netlify Database

Ticket de recherche : [#21](https://github.com/Arcades2/tanstack-starter/issues/21). Bloque [#22](https://github.com/Arcades2/tanstack-starter/issues/22).
Contexte : une transaction par requête de mutation, ouverte dans un global function middleware de TanStack Start, `tx` passé en context, commit si succès, rollback sur toute erreur. Les services peuvent imbriquer `tx.transaction` (savepoints).
État au **25 novembre 2026**. Vérifié dans le code publié sur npm de `drizzle-orm@1.0.0-rc.6` (publié le 20/11/2026) et `@netlify/database@2.0.4` (publié le 24/11/2026), dans le repo `netlify/primitives`, et dans les docs Netlify et Neon. Un prototype a été lancé contre Postgres 17 en local.

## TL;DR

- **Oui, ça marche en prod comme en local, savepoints compris.** `drizzle-orm/netlify-db` n'est **pas** HTTP-only. C'est un driver **hybride** :
  - les requêtes hors transaction passent par Neon HTTP (`neon()`) ;
  - `db.transaction()` prend une connexion dans un `Pool` WebSocket de `@neondatabase/serverless` et y exécute `BEGIN … COMMIT/ROLLBACK` ;
  - `tx.transaction()` pose un `SAVEPOINT` sur cette même connexion.
- **En local** (`NETLIFY_DB_DRIVER=server`), le même `drizzle()` renvoie un `NodePgDatabase` (node-postgres). Les transactions et savepoints y sont implémentés de la même manière. C'est vérifié en exécutant le code (§4).
- **Rien à remplacer.** On n'a pas à changer de driver. On garde l'intégration Netlify (migrations au deploy, branche par preview, `NETLIFY_DB_URL`).
- **Ce qu'il faut savoir :**
  1. En prod, chaque mutation passe par une connexion WebSocket du Pool, pas par HTTP.
  2. Local et prod empruntent deux chemins de code différents derrière le même import (§5).
  3. Le type de `drizzle()` est une union (§6).
  4. La prod a besoin de Node ≥ 22 pour le `WebSocket` global (§3).

## 1. Quel package, quel driver

Netlify documente deux points d'entrée ([Tooling](https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/), [API reference](https://docs.netlify.com/build/data-and-storage/netlify-database/api/)) :

- `drizzle-orm/netlify-db` : « Drizzle ORM has a native Netlify Database adapter. Import `drizzle` from `drizzle-orm/netlify-db` and call it with your schema - the connection is configured automatically. »
- `@netlify/database` (`getDatabase()`, `getConnectionString()`) : « it uses a different underlying connector when running queries from builds or a long-running server compared to when running them in Netlify Functions ». Son `pool` est présenté comme l'outil pour les transactions : « most commonly for transactions, where `BEGIN`, your queries, and `COMMIT`/`ROLLBACK` must all run on the same connection ».

`drizzle-orm/netlify-db` **ne dépend pas** de `@netlify/database` à l'exécution. Il lit lui-même les variables d'environnement. Code de `drizzle()`, extrait de `netlify-db/driver.js` dans le tarball `drizzle-orm@1.0.0-rc.6` (source : [`drizzle-orm/src/netlify-db/driver.ts`, branche `beta`](https://github.com/drizzle-team/drizzle-orm/blob/beta/drizzle-orm/src/netlify-db/driver.ts)) :

```js
const connectionString = process.env["NETLIFY_DB_URL"];
if (process.env["NETLIFY_DB_DRIVER"] === "server")
  return drizzle$1({ connection: connectionString, ...drizzleConfig }); // drizzle-orm/node-postgres
return construct(neon(connectionString), new Pool({ connectionString }), drizzleConfig); // hybride Neon
```

Donc :

| `NETLIFY_DB_DRIVER` | Objet renvoyé | Requêtes simples | `transaction()` |
|---|---|---|---|
| `server` | `NodePgDatabase` | `pg.Pool` (TCP) | `pg.Pool.connect()` + `BEGIN` |
| toute autre valeur, ou absente | `NetlifyDbDatabase` | Neon HTTP (`neon()`) | `Pool` Neon (WebSocket) `.connect()` + `BEGIN` |

Qui pose cette variable ?

- **En dev**, c'est le code public qui la pose à `server` :
  - le plugin Vite / `@netlify/dev` ([`packages/dev/src/main.ts`](https://github.com/netlify/primitives/blob/main/packages/dev/src/main.ts) : `runtime.env.set('NETLIFY_DB_DRIVER', 'server')`) ;
  - la CLI (`src/commands/dev/programmatic-netlify-dev.ts` dans `netlify/cli`).
- **En prod**, c'est la plateforme qui la pose, et ce n'est **documenté nulle part**. Les tests de `@netlify/database` ([`main.test.ts`](https://github.com/netlify/primitives/blob/main/packages/database/prod/src/main.test.ts)) et la phrase de l'API reference sur le « different underlying connector » indiquent `serverless` dans les Functions.
- **Ça ne change rien pour les transactions.** Côté Drizzle, toute valeur autre que `server` mène au driver hybride, et celui-ci supporte les transactions interactives.

Petite incohérence entre les deux packages quand la variable est **absente** :

- `@netlify/database@2.0.4` (`getDatabase()`) prend alors `pg` ;
- `drizzle-orm/netlify-db` prend Neon.

Ça ne nous touche pas tant qu'on n'utilise que `drizzle()`.

## 2. Transactions et savepoints dans le driver hybride

`NetlifyDbSession.transaction` (`netlify-db/session.js`, rc.6 ; source : [`session.ts`, branche `beta`](https://github.com/drizzle-team/drizzle-orm/blob/beta/drizzle-orm/src/netlify-db/session.ts)) fonctionne ainsi :

1. Il appelle `ensureWebSocket()`, puis `const poolClient = await this.pool.connect()`, ce qui ouvre une connexion WebSocket Neon.
2. Il crée un `NetlifyDbTransaction` adossé à un `NetlifyDbWsSession`, qui exécute toutes ses requêtes via `poolClient.query(...)`, donc **sur la même connexion**.
3. Il exécute `begin` (avec l'isolation level et le mode read-only si on les passe), puis le callback, puis `commit`. Si le callback lève une exception : `rollback`, et l'erreur est relancée.
4. Dans le `finally`, il rend le client au pool avec `poolClient.release(err)`. Si la connexion est en erreur, elle est détruite.

`NetlifyDbTransaction.transaction` (imbrication) :

- exécute `savepoint spN` ;
- puis `release savepoint spN` si tout va bien, ou `rollback to savepoint spN` et relance l'erreur.

Un appel à `transaction()` sur la session WS elle-même lève une erreur (« Nested transactions are handled by NetlifyDbTransaction via savepoints »). Ce cas n'arrive pas si on passe toujours par `tx.transaction`.

`tx.rollback()` lève `TransactionRollbackError`. C'est le comportement standard de `PgAsyncTransaction`, et ça déclenche le rollback.

Le chemin `server` (`node-postgres/session.js`, `NodePgSession.transaction` / `NodePgTransaction.transaction`) est **le même algorithme, ligne pour ligne** : `pool.connect()`, `begin`, `commit`/`rollback`, `release`, savepoints `spN`.

La 0.45 stable a la même implémentation : `drizzle-orm@0.45.4` contient `netlify-db/`, avec `pool.connect()` et les savepoints. Voir la surprise n°1 plus bas.

Côté Neon, la [doc du serverless driver](https://neon.com/docs/serverless/serverless-driver) dit exactement ça : HTTP « for single queries and non-interactive transactions », WebSocket `Pool`/`Client` « only if you need interactive transactions, sessions ».

## 3. Coûts en prod (Netlify Function, Node, 60 s)

- **Toutes les mutations passent par le WebSocket.** Avec une transaction par mutation, chaque mutation fait un `pool.connect()`. Les lectures hors transaction restent en HTTP.
- **Le Pool est global au module, et Drizzle ne le ferme jamais.** Il est créé une fois par instance de Function, au `drizzle()` du module `db`, donc réutilisé tant que l'instance est chaude. Paramètres par défaut de `pg.Pool` (le Pool Neon en est un fork) : `max` 10, `idleTimeoutMillis` 10 000.
  - Si une instance reçoit des mutations à moins de 10 s d'intervalle, elle réutilise la connexion.
  - Sinon, elle refait le handshake WebSocket + TLS + auth Postgres. C'est ce qui coûte en latence au premier `BEGIN` après un cold start ou une pause.
  - Une connexion qui meurt pendant que Lambda gèle l'instance est détectée à l'usage (`on("error")`). Elle est alors détruite au `release`, et la requête en cours échoue.
- **Faut-il fermer le pool à la fin de l'invocation ?** Ce n'est pas obligatoire sur Netlify Functions, qui tournent sur Node / Lambda et non sur un runtime edge.
  - La règle de Neon (« must be connected, used and closed within a single request handler ») vise explicitement les runtimes edge (« In edge runtimes such as Cloudflare Workers and the Vercel Edge runtime, WebSocket connections can't outlive a single request »).
  - Les exemples Neon pour Vercel Functions ferment quand même le pool (`waitUntil(pool.end())`). Netlify offre aussi `context.waitUntil` ([Functions API](https://docs.netlify.com/build/functions/api/)).
  - Mais `drizzle()` sans argument cache son Pool (`db.$client.pool`), et le fermer casserait l'instance pour les invocations suivantes. **À ne pas faire avec la configuration retenue.**
- **Connexions.** En pratique, c'est au plus une connexion par instance de Function active, car Lambda traite une requête à la fois par instance et on n'ouvre qu'une transaction par requête. Ça peut monter jusqu'à `max` 10 si du code parallélise des transactions dans une même requête, ce qu'on ne fait pas.
- **URL poolée ?** Netlify ne dit pas si `NETLIFY_DB_URL` pointe sur le pooler PgBouncer de Neon (hôte `-pooler`). **Non vérifié.** On ne dispose que d'**une seule** URL, et la doc n'en mentionne pas d'autre.
  - Ça ne bloque pas les transactions interactives : même en mode transaction de PgBouncer, la connexion serveur reste attribuée pendant toute la transaction, savepoints compris.
  - Ça vaut le coup de regarder le hostname une fois une DB provisionnée (`netlify database connect --json`).
- **Limite de 60 s.** Une transaction vit dans l'invocation, donc la limite ne pose pas de problème. Mais **ne pas faire d'I/O externe lente (email, HTTP tiers) pendant que `tx` est ouverte** : on garderait la connexion et les verrous.
- **Node ≥ 22 obligatoire en prod.**
  - `ensureWebSocket()` de Drizzle ne prend que le `WebSocket` global. Il ne charge pas `ws`, contrairement à `@netlify/database`, qui retombe sur `ws`.
  - Le `WebSocket` global existe depuis Node 22. Sans lui, Neon ne sait pas ouvrir le Pool (voir la section Troubleshooting de la [doc Neon](https://neon.com/docs/serverless/serverless-driver)).
  - Les Functions prennent la version de Node du build, avec Node 24 par défaut ([Optional configuration](https://docs.netlify.com/build/functions/optional-configuration/)). Il suffit de **ne pas épingler Node < 22**.

## 4. Local (container Postgres de compose)

Avec la config retenue dans [#14](https://github.com/Arcades2/tanstack-starter/issues/14) (`NETLIFY_DB_URL=postgres://…@postgres:5432/…` et `NETLIFY_DB_DRIVER=server`), `drizzle()` renvoie un `NodePgDatabase`, et les transactions passent par `pg.Pool`.

Prototype exécuté (Node 26, `drizzle-orm@1.0.0-rc.6`, `postgres:17-alpine`) :

- **Cas 1.** Une transaction externe insère 1. Une transaction imbriquée insère 2, puis une transaction sous-imbriquée insère 3, puis l'imbriquée lève une erreur. L'externe l'attrape et commit. Résultat : `[1]`. Le savepoint a bien annulé 2 et 3, et l'externe a bien commité 1.
- **Cas 2.** Une transaction externe insère 10, une imbriquée insère 11 sans erreur, puis l'externe lève une erreur. Résultat : rien de 10 ni 11. Le rollback complet fonctionne.
- **Sans `NETLIFY_DB_DRIVER=server`**, la même config donne un `NetlifyDbDatabase`, et la première requête échoue (`DrizzleQueryError`), car Neon HTTP ne parle pas à un Postgres nu. **La variable est indispensable en local.**

Un `tsc --strict` passe sur ce code :

```ts
const db = drizzle();
type Tx = Parameters<Parameters<typeof db["transaction"]>[0]>[0];
db.transaction(async (tx) => service(tx));
async function service(tx: Tx) { await tx.transaction(async (inner) => { /* ... */ }); }
```

## 5. « Un seul adapter » : vrai pour l'import, pas pour le chemin d'exécution

On importe le même `drizzle-orm/netlify-db` partout, mais en local on exécute `drizzle-orm/node-postgres` et en prod `NetlifyDbSession`/`NetlifyDbWsSession`. Les sémantiques de transaction sont identiques (§2). En revanche, **les codecs diffèrent** :

- `netlifyDbCodecs` pour les requêtes HTTP ;
- `netlifyDbTransactionCodecs` dans les transactions (« Netlify utilizes different driver for transactions, thus requiring separate set of codecs », `driver.d.ts`) ;
- les codecs node-postgres en local.

Un bug de parsing (dates, bigint, numeric, tableaux) qui n'existe qu'en prod ne se verra donc pas en local. Le `.d.ts` précise aussi : « Sessions must use the ISO `DateStyle` ».

On ne peut pas exercer le chemin Neon en local sans un proxy Neon devant Postgres. Ça existe en communautaire, non vérifié ici. Le plus simple est de tester ce chemin sur une deploy preview.

## 6. Le type de `drizzle()` est une union

`drizzle()` sans client est déclaré `(NetlifyDbDatabase & {…}) | (NodePgDatabase & {…})`. Les appels courants (`select`, `insert`, `transaction`, `tx.transaction`) se typent sans souci (§4).

Pour le type de `tx` qu'on met dans le context du middleware, il faut **le dériver de `db`** (`Parameters<…>` comme ci-dessus) plutôt que d'importer une classe de transaction précise. Une alternative est de typer sur la classe de base `PgAsyncTransaction` de `drizzle-orm/pg-core`, non testé ici.

## Verdict

Une transaction interactive par requête de mutation, avec savepoints imbriqués, **fonctionne sur Netlify Database avec `drizzle-orm/netlify-db` tel que configuré**, en prod comme en local. **Aucun changement de driver n'est nécessaire.**

Points à intégrer au design de #20 / #22 :

1. Garder `NETLIFY_DB_DRIVER=server` en local. C'est obligatoire.
2. Ne pas épingler Node < 22 sur Netlify.
3. Ne jamais appeler `pool.end()` sur le client caché de `drizzle()`.
4. Pas d'I/O externe lente dans `tx` : envoyer les emails après le commit, ou via `context.waitUntil`.
5. Dériver le type `Tx` de `db`.
6. Valider une fois sur une deploy preview le chemin Neon (codecs dans une transaction) et le hostname de `NETLIFY_DB_URL` (poolé ou non).

Si un jour on voulait un seul chemin d'exécution partout, on pourrait passer à `drizzle-orm/node-postgres` avec `getConnectionString()` (TCP direct vers Neon depuis la Function). La doc Netlify montre exactement ce pattern avec `pg.Pool`, et l'intégration (migrations, branches) ne dépend pas du driver. Le prix : un handshake TCP+TLS au lieu d'une requête HTTP pour les lectures, et on sort de l'adapter « recommandé ». Rien ne l'impose aujourd'hui.

## Surprises

1. **`drizzle-orm/netlify-db` existe aussi en stable.** Il est arrivé dans `drizzle-orm@0.45.3` (21/09/2026), et il est dans `0.45.4`, l'actuel `latest`. Le [changelog 0.45.3](https://github.com/drizzle-team/drizzle-orm/blob/main/changelogs/drizzle-orm/0.45.3.md) l'annonce, en précisant « developed and maintained by the Netlify team ». Les tickets #7/#14 partaient du principe que l'adapter n'existait qu'en 1.0. La raison « l'adapter impose la RC » ne tient donc plus seule : il reste `drizzle-orm/valibot` et le format de migrations 1.0 que la doc Netlify recommande (« We recommend installing `drizzle-orm` and `drizzle-kit` from the `beta` tag »).
2. **Le driver est hybride, pas HTTP-only.** Le ticket envisageait l'un ou l'autre.
3. **La valeur de `NETLIFY_DB_DRIVER` en prod n'est pas documentée**, et les deux packages n'interprètent pas pareil une variable absente (§1).
4. **Drizzle ne retombe pas sur `ws`.** Il faut Node ≥ 22 en prod (§3).

## Sources

- Code npm : `drizzle-orm@1.0.0-rc.6` (`netlify-db/driver.js`, `netlify-db/session.js`, `netlify-db/driver.d.ts`, `node-postgres/session.js`), `drizzle-orm@0.45.4` (`netlify-db/session.js`), `@netlify/database@2.0.4` (`dist/main.js`). Récupérés avec `npm pack` le 25/11/2026.
- GitHub : [drizzle-team/drizzle-orm `beta` / `src/netlify-db`](https://github.com/drizzle-team/drizzle-orm/tree/beta/drizzle-orm/src/netlify-db), [netlify/primitives `packages/database/prod/src/main.ts`](https://github.com/netlify/primitives/blob/main/packages/database/prod/src/main.ts), [netlify/primitives `packages/dev/src/main.ts`](https://github.com/netlify/primitives/blob/main/packages/dev/src/main.ts).
- Docs Netlify : [Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database/), [Tooling](https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/), [API reference](https://docs.netlify.com/build/data-and-storage/netlify-database/api/), [Local development](https://docs.netlify.com/build/data-and-storage/netlify-database/local-development/), [Functions optional configuration](https://docs.netlify.com/build/functions/optional-configuration/), [Functions API (`waitUntil`)](https://docs.netlify.com/build/functions/api/).
- Docs Neon : [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver).
