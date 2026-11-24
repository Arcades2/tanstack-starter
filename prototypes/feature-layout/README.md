# PROTOTYPE, à jeter : disposition des fichiers dans une feature

Branche jetable pour le ticket « Disposition des fichiers dans une feature » (#20). Elle ne sera jamais mergée.
Le code ne compile pas (aucune dépendance installée). Il sert à lire les chemins et les imports.

Même feature `posts` dans les trois variantes : une liste (query) et une publication (mutation + form).
Chaque variante montre aussi ses consommateurs :
- `routes/_protected/posts/index.tsx` : la route qui précharge puis monte le smart component ;
- `features/dashboard/` : une aggregate feature qui réutilise `PostList` ;
- `features/account/account.server.ts` : une opération d'une autre feature qui appelle `deletePostsByAuthor` dans sa transaction.

| | A. Racine publique | B. Dossier `components/` | C. Slices par cas d'usage |
|---|---|---|---|
| Racine | smart components + `posts.server.ts` + `posts.queries.ts` | tous les fichiers TS : `.server`, `.functions`, `.queries` | `posts.keys.ts`, plus les opérations sans cas d'usage UI |
| Sous-dossiers | `components/` (dumb), `functions/` (schémas + server fns), privés | `components/` (tous les components), public | un dossier par action (`list-posts/`, `publish-post/`), public à profondeur 2 |
| Schémas Valibot | avec les server fns, dans `functions/` | avec les server fns, à la racine | avec la server fn de leur slice |
| Route → | `@/features/posts/post-list` | `@/features/posts/components/post-list` | `@/features/posts/list-posts/post-list` |
| Règle Biome | inchangée (ADR 0001) | amendée : négation `!…/components/*` (à vérifier) | amendée : interdit seulement la profondeur 3+ |
| Racine = interface publique ? | oui, exactement | non : `posts.functions.ts` est à la racine, mais interne | non : la racine contient peu de choses |
| Point faible | les smart components restent à la racine, mêlés au TS | rien ne distingue un smart public d'un dumb interne | slices de taille inégale, et du code partagé entre slices (`PostCard`, les keys) à placer ; la liste fermée de dossiers disparaît |

Point commun : un schéma vit dans le fichier de sa server fn, et le form l'importe depuis ce fichier, qui peut être importé côté client.
