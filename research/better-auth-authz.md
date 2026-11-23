# Rôles puis permissions avec better-auth : comment ?

Recherche pour le ticket #4 (bloque le grilling #12, design de l'auth).
État des sources au 2026-11-23 : better-auth **1.7.27** (`latest` sur npm),
1.8.0-beta.11 en `beta`. Le diff entre 1.7.27 et la branche `next` (1.8) ne
touche pas au contrôle d'accès (seulement `revokeUserSession` et `removeUser`
dans `admin/routes.ts`), donc tout ce qui suit vaut pour 1.7 et 1.8.

Sources primaires principales :

- Doc du plugin admin, section Access Control : <https://www.better-auth.com/docs/plugins/admin#access-control>
- Source, tag `v1.7.27` :
  - [`plugins/access/access.ts`](https://github.com/better-auth/better-auth/blob/v1.7.27/packages/better-auth/src/plugins/access/access.ts) (`createAccessControl`, `newRole`, `authorize`)
  - [`plugins/admin/access/statement.ts`](https://github.com/better-auth/better-auth/blob/v1.7.27/packages/better-auth/src/plugins/admin/access/statement.ts) (statements et rôles par défaut)
  - [`plugins/admin/has-permission.ts`](https://github.com/better-auth/better-auth/blob/v1.7.27/packages/better-auth/src/plugins/admin/has-permission.ts) (résolution rôle(s) vers permission)
  - [`plugins/admin/schema.ts`](https://github.com/better-auth/better-auth/blob/v1.7.27/packages/better-auth/src/plugins/admin/schema.ts) (colonnes ajoutées)
  - [`plugins/admin/routes.ts`](https://github.com/better-auth/better-auth/blob/v1.7.27/packages/better-auth/src/plugins/admin/routes.ts) (`setRole` l.133-160, `userHasPermission` l.1819)
- Changelog : <https://github.com/better-auth/better-auth/blob/v1.7.27/packages/better-auth/CHANGELOG.md>
- Intégration TanStack Start (doc better-auth) : <https://www.better-auth.com/docs/integrations/tanstack>
- Middleware TanStack Start : <https://tanstack.com/start/latest/docs/framework/react/guide/middleware>
- Cookie cache des sessions : <https://www.better-auth.com/docs/concepts/session-management#cookie-cache>
- Dynamic access control (organisations) : <https://www.better-auth.com/docs/plugins/organization#dynamic-access-control>

## 1. Le modèle de better-auth en bref

better-auth fait déjà un **RBAC où un rôle est un ensemble nommé de
permissions**. C'est exactement le « mélange » recherché.

- **Statement** : un objet `ressource -> actions possibles`, déclaré en code
  avec `as const`. Exemple : `{ project: ["create", "update", "delete"] }`.
- **`createAccessControl(statement)`** renvoie un contrôleur `ac` dont
  `ac.newRole({...})` crée un rôle, c'est-à-dire un sous-ensemble typé du
  statement. TypeScript refuse une ressource ou une action inconnue
  (`RoleInput` dans [`access/types.ts`](https://github.com/better-auth/better-auth/blob/v1.7.27/packages/better-auth/src/plugins/access/types.ts)).
- **Un rôle expose `authorize(request, connector?)`** : une fonction pure et
  synchrone, sans I/O. Par défaut toutes les actions demandées doivent être
  accordées (`AND`). On peut passer `"OR"` globalement, ou
  `{ actions, connector: "OR" }` pour une seule ressource ([`access.ts`](https://github.com/better-auth/better-auth/blob/v1.7.27/packages/better-auth/src/plugins/access/access.ts)).
- **Plugin `admin`** : il branche ce contrôleur sur l'utilisateur. Il ajoute
  à la table `user` les colonnes `role` (string, `input: false`, donc pas
  modifiable à l'inscription), `banned`, `banReason` et `banExpires`, plus
  `session.impersonatedBy` ([`schema.ts`](https://github.com/better-auth/better-auth/blob/v1.7.27/packages/better-auth/src/plugins/admin/schema.ts)).
  Il fournit aussi les endpoints de gestion (list/ban/impersonate/set-role…).
- **Ce qui est stocké en base, c'est seulement le nom du rôle**, pas les
  permissions. Plusieurs rôles sont stockés en chaîne séparée par des
  virgules (`"user,editor"`). Les permissions de chaque rôle vivent dans le
  code (`options.roles`).
- **Rôles par défaut** : `admin` et `user`, sur deux ressources internes au
  plugin : `user` (`create`, `list`, `set-role`, `ban`, `impersonate`,
  `impersonate-admins`, `delete`, `set-password`, `set-email`, `set-phone`,
  `get`, `update`) et `session` (`list`, `revoke`, `delete`). `admin` a tout
  sauf `impersonate-admins`, et `user` n'a rien ([`statement.ts`](https://github.com/better-auth/better-auth/blob/v1.7.27/packages/better-auth/src/plugins/admin/access/statement.ts)).
- Le rôle par défaut d'un nouvel utilisateur est `defaultRole` (défaut
  `"user"`). `adminUserIds` court-circuite tous les contrôles : ces ids
  ont toutes les permissions ([`has-permission.ts`](https://github.com/better-auth/better-auth/blob/v1.7.27/packages/better-auth/src/plugins/admin/has-permission.ts)).

### Sémantique multi-rôles (subtile)

`hasPermission` découpe `user.role` sur les virgules et renvoie `true` si
**un seul rôle** autorise **toute** la requête. Les permissions de deux rôles
**ne se cumulent pas** pour une même vérification. Si `editor` a
`project:update` et `billing` a `invoice:read`, alors
`{ project: ["update"], invoice: ["read"] }` échoue pour un utilisateur
`"editor,billing"`. En revanche, deux vérifications séparées réussissent.
Le plus simple est d'éviter le multi-rôle, ou de toujours vérifier une
seule ressource à la fois.

## 2. Comment vérifier une permission

Quatre outils sont fournis (doc admin, section [Access Control Usage](https://www.better-auth.com/docs/plugins/admin#access-control-usage)) :

| Outil | Où | Ce qu'il vérifie | Coût |
|---|---|---|---|
| `auth.api.userHasPermission({ headers, body: { permissions } })` | serveur | le rôle de l'utilisateur de la session | lecture de session **autoritative** (`getAuthoritativeSessionFromCtx`, ignore le cookie cache) |
| `auth.api.userHasPermission({ body: { userId \| role, permissions } })` | serveur, sans headers | un utilisateur ou un rôle arbitraire | idem, plus un `findUserById` si `userId` |
| `authClient.admin.hasPermission({ permissions })` | client | l'utilisateur connecté | un aller-retour HTTP vers `/admin/has-permission` |
| `authClient.admin.checkRolePermission({ role, permissions })` | client | un **rôle** donné, pas l'utilisateur | synchrone, local |

On peut aussi appeler directement `roles[role].authorize(perms)`. C'est
exactement ce que fait `hasPermission` en interne. C'est pur et synchrone, et
c'est utilisable côté serveur comme côté client si `permissions.ts` est
partagé (le fichier ne contient aucun secret).

**Piège du cookie cache** : si `session.cookieCache` est activé,
`auth.api.getSession()` peut renvoyer un `user.role` vieux de `maxAge`
secondes (exemple de la doc : 5 min). Les endpoints admin, eux, relisent la
session en base depuis 1.6.21 (#10187 : « Admin permission changes and bans
now take effect immediately for admin APIs, even when session cookie cache
is enabled »). Pour un contrôle d'autorisation serveur fait à la main, il faut
donc soit passer par `auth.api.userHasPermission`, soit appeler `getSession`
avec `query: { disableCookieCache: true }`, soit ne pas activer le cookie cache.

## 3. Démarrer avec des rôles, évoluer vers des permissions fines : quel coût ?

Comme les permissions sont du code et que la base ne contient que des noms de
rôles, le coût dépend de ce qu'on change :

| Évolution | Coût |
|---|---|
| Ajouter une ressource ou une action au statement | code seulement |
| Changer les permissions d'un rôle existant | code seulement, effet immédiat pour tous les porteurs du rôle |
| Ajouter un rôle (`editor`, `support`…) | code seulement. `setRole` refuse un rôle absent de `options.roles` ([`routes.ts` l.146-160](https://github.com/better-auth/better-auth/blob/v1.7.27/packages/better-auth/src/plugins/admin/routes.ts#L146-L160)) |
| Renommer ou supprimer un rôle | **migration de données** : `UPDATE user SET role = ...`. Les lignes existantes ne sont pas revalidées, et un rôle inconnu ne donne aucune permission |
| Accorder une permission à **un utilisateur précis** (hors rôle) | **non fourni** par le plugin admin. Il faut créer un rôle dédié ou une table maison |
| Rôles éditables à chaud depuis une UI (stockés en base) | **non fourni** au niveau utilisateur. Le plugin `organization` le propose (`dynamicAccessControl`, table `organizationRole`), mais les organisations sont hors périmètre du starter |

La condition pour une évolution sans douleur est la suivante : **le code
applicatif ne teste jamais un nom de rôle** (`user.role === "admin"`), il ne
teste que des permissions (`can({ project: ["delete"] })`). Les rôles restent
alors un détail de configuration, regroupé dans `permissions.ts`. Le jour où
il faut un rôle intermédiaire, on l'ajoute dans ce seul fichier, et aucun
appel ne change.

**Point d'attention, le statement du plugin admin grossit avec les
versions.** `set-email` a été ajouté en 1.6.16 (#9974) et `set-phone` en
1.7.16 (#12198), avec à chaque fois la consigne d'ajouter l'action dans les
statements personnalisés. Pour en hériter automatiquement, on étale
`defaultStatements` et `adminAc.statements` au lieu de les recopier à la
main. C'est aussi ce que recommande la doc : « When you create custom roles
for existing roles, the predefined permissions for those roles will be
overridden ».

## 4. Intégration TanStack Start

La doc better-auth montre le schéma de base : handler monté sur
`src/routes/api/auth/$.ts`, plugin `tanstackStartCookies()` en dernier,
helpers `getSession` et `ensureSession` en server functions, garde dans
`beforeLoad` d'une route pathless `_protected` ([doc](https://www.better-auth.com/docs/integrations/tanstack#protecting-resources)).
Elle ne couvre **pas** les permissions : c'est à nous de l'étendre.

Côté TanStack Start, le bon point d'extension est le middleware de server
function (`createMiddleware({ type: "function" }).server(({ next }) => next({ context }))`,
attaché via `createServerFn().middleware([...])`). La doc précise que
la validation de forme n'est pas de l'autorisation, et que la session doit
venir d'une source de confiance côté serveur ([doc middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware)).

Points clés :

- **`beforeLoad` tourne aussi côté client** lors des navigations `<Link>`.
  La garde de route doit donc passer par une server function (c'est ce que
  fait la doc better-auth), ou se baser sur le rôle déjà présent dans le
  contexte de route avec un `permissions.ts` partagé.
- **La garde de route n'est que de l'UX.** La vraie barrière est la
  vérification dans chaque server function qui lit ou écrit des données.

## 5. Esquisses de code

### `src/lib/auth/permissions.ts` (partagé client et serveur)

```ts
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

export const statement = {
  ...defaultStatements, // user/session du plugin admin, suivis automatiquement
  // ressources de l'app, à compléter par chaque app dérivée :
  // project: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  user: ac.newRole({
    // project: ["create", "read"],
  }),
  admin: ac.newRole({
    ...adminAc.statements,
    // project: ["create", "read", "update", "delete"],
  }),
} as const;

export type Role = keyof typeof roles;
export type Permissions = Parameters<(typeof roles)[Role]["authorize"]>[0];

/** Pure, synchrone : même sémantique que better-auth (un rôle doit tout couvrir). */
export function roleCan(role: string | null | undefined, permissions: Permissions) {
  return (role ?? "user")
    .split(",")
    .some((r) => roles[r.trim() as Role]?.authorize(permissions).success);
}
```

### `src/lib/auth/auth.ts` et `auth-client.ts`

```ts
// auth.ts
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { ac, roles } from "./permissions";

export const auth = betterAuth({
  // ...
  plugins: [admin({ ac, roles }), tanstackStartCookies()], // cookies en dernier
});

// auth-client.ts
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { ac, roles } from "./permissions";

export const authClient = createAuthClient({ plugins: [adminClient({ ac, roles })] });
```

### Middleware de server function

```ts
// src/lib/auth/middleware.ts
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "./auth";
import type { Permissions } from "./permissions";

export const authMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const session = await auth.api.getSession({
      headers: getRequestHeaders(),
      query: { disableCookieCache: true }, // rôle frais (cf. §2)
    });
    if (!session) throw new Error("UNAUTHORIZED"); // ou setResponseStatus(401)
    return next({ context: { session } });
  },
);

export const requirePermission = (permissions: Permissions) =>
  createMiddleware({ type: "function" })
    .middleware([authMiddleware])
    .server(async ({ next }) => {
      const { success } = await auth.api.userHasPermission({
        headers: getRequestHeaders(),
        body: { permissions },
      });
      if (!success) throw new Error("FORBIDDEN"); // ou setResponseStatus(403)
      return next();
    });
```

Variante sans deuxième lecture de session : dans `requirePermission`, lire
`context.session.user.role` et appeler `roleCan(role, permissions)`.

### Server function protégée

```ts
export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requirePermission({ project: ["delete"] })])
  .inputValidator(v.parser(v.object({ id: v.string() })))
  .handler(async ({ data, context }) => {
    // context.session.user est typé
  });
```

### Garde de route (`beforeLoad`)

```tsx
// src/routes/_protected.tsx : session dans le contexte (doc better-auth)
beforeLoad: async ({ location }) => {
  const session = await getSession(); // server fn
  if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
  return { user: session.user };
},

// src/routes/_protected/admin.tsx : permission via le permissions.ts partagé
beforeLoad: ({ context }) => {
  if (!roleCan(context.user.role, { user: ["list"] })) throw redirect({ to: "/" });
},
```

Pour masquer un bouton dans un composant, appeler `roleCan(user.role, ...)`
directement. Pas de requête réseau.

## 6. Recommandation (à trancher dans #12)

- **Utiliser le RBAC du plugin `admin` tel quel : des rôles définis en code
  comme ensembles de permissions.** C'est un vrai mélange : le starter
  démarre avec deux rôles (`user`, `admin`) dans un seul fichier, sans coût
  pour une petite app, et chaque app ajoute ressources et rôles dans ce même
  fichier.
- **Règle de conduite : le code teste des permissions, jamais des noms de
  rôles.** C'est elle qui rend l'évolution indolore : changer les droits d'un
  rôle ou en ajouter un ne demande que du code, sans migration.
- **Hériter des statements admin par spread**, pour suivre les ajouts de
  better-auth (`set-email`, `set-phone`…).
- **Fournir dans le starter** `permissions.ts` partagé, `roleCan`, un
  middleware `authMiddleware` et un middleware `requirePermission`, plus la
  route `_protected`. Décider du cookie cache en connaissance de cause :
  activé, il impose une lecture fraîche pour l'autorisation.
- **Éviter le multi-rôle par défaut**, à cause de la sémantique « un rôle
  doit tout couvrir ».
- **Hors périmètre** : permissions par utilisateur et rôles éditables à
  chaud. À traiter par une table maison le jour où une app en a besoin, ou par
  le plugin `organization` si le multi-tenant revient un jour dans le
  périmètre.

Questions pour le grilling #12 : faut-il activer le cookie cache par défaut ?
Le starter embarque-t-il le plugin `admin` complet (ban, impersonation), ou
seulement le contrôle d'accès ? Faut-il une page d'admin des utilisateurs
fournie ? Quel nom donner au helper (`can`, `roleCan`, `requirePermission`) ?
