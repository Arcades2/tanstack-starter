# Support de Valibot dans l'écosystème du starter

Ticket : [#5](https://github.com/Arcades2/tanstack-starter/issues/5) (carte [#1](https://github.com/Arcades2/tanstack-starter/issues/1)).
Date de la recherche : 2026-11-23. Versions vérifiées sur le registre npm ce jour-là, et dans le code publié des paquets (`npm pack`) quand la doc ne suffisait pas.

## Réponse courte

Valibot (1.5.0) implémente [Standard Schema](https://standardschema.dev) v1. Tout l'écosystème TanStack, t3-env et la surface publique de better-auth acceptent un schéma Standard Schema **sans adaptateur**. Côté ORM, Drizzle génère des schémas Valibot de première main ; Prisma n'a rien d'officiel et les générateurs communautaires sont fragiles. Il reste deux trous réels : **better-auth embarque Zod en dépendance dure côté serveur** (pas côté client React), et **Prisma n'a pas de génération Valibot fiable**.

## Versions de référence (npm, 2026-11-23)

| Paquet | `latest` | Remarque |
|---|---|---|
| `valibot` | 1.5.0 (2026-09-09) | Standard Schema v1 natif depuis 1.0 |
| `@standard-schema/spec` | 1.1.0 | ajoute `StandardJSONSchemaV1` ([README](https://github.com/standard-schema/standard-schema)) |
| `@t3-oss/env-core` | 0.13.11 | `valibot` en peer optionnelle |
| `@tanstack/react-form` | 1.33.5 | |
| `@tanstack/react-router` | 1.170.46 | |
| `@tanstack/react-start` | 1.169.7 | dépend de `@tanstack/start-client-core` 1.170.39 |
| `better-auth` | 1.7.27 | dépend de `zod ^4.5.4` |
| `drizzle-orm` | 0.45.4 (stable), 1.0.0-rc.6 (tag `rc`, 2026-11-20) | |
| `drizzle-valibot` | 0.4.2 | déprécié au profit de `drizzle-orm/valibot` en v1 |
| `prisma` / `@prisma/client` | CLI `latest` = 8.0.0-rc.35, client `latest` = 7.10.1 | voir mise en garde plus bas |

## Tableau de support par outil

| Outil | Support Valibot | Comment | Source |
|---|---|---|---|
| **t3-env** (`@t3-oss/env-core`) | Complet | `createEnv` accepte n'importe quel schéma Standard Schema par variable ; `createFinalSchema` reçoit un schéma Standard Schema (validation via `~standard.validate`). Presets Valibot à parité avec Zod, dont `netlify()` et `vite()` (`@t3-oss/env-core/presets-valibot`). | [Doc Standard Schema](https://env.t3.gg/docs/standard-schema), [doc customization](https://github.com/t3-oss/t3-env/blob/main/docs/src/app/docs/customization/page.mdx), code `dist/index.js` et `dist/presets-valibot.js` du paquet 0.13.11 |
| **TanStack Form** | Complet (validation), partiel (valeurs transformées) | Schéma Valibot passé directement à `validators.onChange/onBlur/onSubmit` au niveau formulaire ou champ ; les erreurs du formulaire se propagent aux champs. `form.parseValuesWithSchema(schema)` / `field.parseValueWithSchema(schema)` existent pour les cas custom. **La validation ne renvoie pas les valeurs transformées** : `onSubmit` reçoit les valeurs d'entrée. | [Guide validation](https://github.com/TanStack/form/blob/main/docs/framework/react/guides/validation.md#standard-schema-libraries), [submission handling](https://tanstack.com/form/latest/docs/framework/react/guides/submission-handling), `FormApi.d.ts` 1.33.5 |
| **TanStack Router** (search params) | Complet | `validateSearch: v.object(...)` sans adaptateur : le router lit `~standard.types` pour typer l'**input** (navigation) et l'**output** (lecture). La doc recommande `v.optional(v.fallback(schéma, défaut), défaut)`. Validation **synchrone uniquement** (`SearchParamError("Async validation not supported")`). `@tanstack/valibot-adapter` (1.167.0) existe encore mais n'est plus nécessaire. | [Guide search params, section Valibot](https://github.com/TanStack/router/blob/main/docs/router/guide/search-params.md#valibot), `router-core/dist/esm/validators.d.ts` et `router.js` |
| **TanStack Start** (server functions, middlewares) | Complet | `createServerFn().validator(schemaValibot).handler(({ data }) => …)` ; `execValidator` teste `"~standard" in validator` puis appelle `validate` (async accepté). Même méthode `.validator()` sur `createMiddleware({ type: 'function' })`. NB : dans la version courante la méthode s'appelle `.validator()` (doc et code), pas `.inputValidator()`. | [Guide server functions](https://github.com/TanStack/router/blob/main/docs/start/framework/react/guide/server-functions.md), `start-client-core/dist/esm/createServerFn.js` l. 166-175, `createMiddleware.d.ts` |
| **better-auth** | Partiel | Les points d'extension acceptent Standard Schema : `additionalFields.*.validator.{input,output}` (« Works with any Standard Schema library, such as Zod, Valibot or ArkType ») et les endpoints custom via `better-call` (`body`/`query: StandardSchemaV1`). Mais **better-auth dépend de `zod` en dépendance directe** et ses endpoints internes sont typés en Zod. Le client React de base n'importe pas Zod (graphe d'imports de `dist/client/react` vérifié). | `@better-auth/core/dist/db/type.d.mts` l. 91-97, `better-call/dist/endpoint.d.mts`, `npm view better-auth dependencies` |
| **Drizzle** | Complet (première main) | Stable 0.45 : paquet `drizzle-valibot` 0.4.2 (`createSelectSchema`, `createInsertSchema`, `createUpdateSchema`). v1 (rc) : intégré à `drizzle-orm/valibot`, `drizzle-valibot` déprécié depuis 1.0.0-beta.15. Peer `valibot >=1.0.0-beta.7`. | [Doc Drizzle valibot](https://orm.drizzle.team/docs/valibot) ([source](https://github.com/drizzle-team/drizzle-orm-docs/blob/main/src/content/docs/valibot.mdx)), exports de `drizzle-orm@1.0.0-rc.6/valibot` |
| **Prisma** | Aucun support officiel | Pas de mention de Valibot dans `prisma/prisma` ni `prisma/docs`. Générateurs communautaires : `prisma-valibot-generator` 2.0.0 (dépend de `@prisma/*` ^6.19, pas aligné sur Prisma 7) ; `@nvt1904/prisma-valibot-generator` (Prisma 7 mais `valibot ^0.42`, pré-1.0, donc sans Standard Schema). | [prisma-valibot-generator](https://github.com/omar-dulaimi/prisma-valibot-generator), [@nvt1904/prisma-valibot-generator](https://github.com/nvt1904/prisma-valibot-generator), `npm view … dependencies` |

## Trous et contournements

1. **better-auth tire Zod côté serveur.** Impossible à éviter : `zod` est une dépendance directe, pas une peer. Impact : Zod dans `node_modules` et dans le bundle serveur, aucun dans le bundle client React de base. Contournement : l'accepter. Le code applicatif n'écrit que du Valibot (`additionalFields.validator`, endpoints de plugins custom). Une règle Biome `noRestrictedImports` sur `zod` empêche son usage direct dans le code du starter.
2. **TanStack Form ne rend pas la sortie du schéma.** Les `transform`/`fallback` Valibot ne s'appliquent pas aux valeurs reçues par `onSubmit`. Contournement documenté : re-parser dans `onSubmit` (`v.parse(schema, value)`), ou mieux, laisser la server function appeler `.validator(schema)` sur la même définition. Un seul schéma sert alors au formulaire et au serveur.
3. **Search params : validation synchrone seulement.** Ne pas mettre d'action async (`v.pipeAsync`, `checkAsync`) dans `validateSearch`. Avec Valibot, cela se voit à la frontière `*Async`.
4. **Prisma : pas de schémas générés.** Si Prisma est retenu, écrire les schémas Valibot à la main près des server functions, ou tester `prisma-valibot-generator` avec Prisma 7 (non vérifié ici : ses dépendances visent Prisma 6). Avec Drizzle, le trou disparaît (`createInsertSchema(table)` puis `v.pick`/`v.omit`).
5. **Drizzle : choix de branche.** En 0.45 stable, il faut `drizzle-valibot`. En v1 (encore `rc` le 2026-11-23), il faut `drizzle-orm/valibot`. La migration ne change que le chemin d'import. better-auth accepte déjà `drizzle-orm ^0.45.2 || >=1.0.0-rc.1`.
6. **Mise en garde Prisma (hors Valibot, utile pour #ORM)** : le dist-tag `latest` du CLI `prisma` pointe sur `8.0.0-rc.35`, alors que `@prisma/client` `latest` est 7.10.1. Les peers de better-auth s'arrêtent à `prisma ^7`. Épingler explicitement en 7.x si Prisma est choisi.
7. **`@tanstack/valibot-adapter` est superflu.** Il ne faut pas l'installer : Standard Schema couvre le typage input/output.

## Conséquence pour le spec

Valibot tient sur toute la stack visée sans adaptateur. Seule concession : Zod reste présent en transitif via better-auth, côté serveur uniquement. Sur ce critère, Drizzle a un avantage net sur Prisma (génération de schémas Valibot officielle).
