# Layered, flat layout with the feature in file names

Supersedes [ADR 0001](0001-feature-based-architecture.md). Amended by [ADR 0003](0003-domain-layer-auth-and-app-shell.md): `data/` is renamed `domain/`, and auth, middleware, emails and the app shell get their place.

Derived app code is sorted by kind of code first. Inside each kind, files sit flat and the feature only shows in their names (`post-details.tsx`). The data layer is the one exception: it has a folder per feature (`data/posts/`), because a query almost always has an obvious main feature, while a component often has none. ADR 0001 gave each feature a folder with a public interface, so every file needed an owner. Screens routinely mix several features (a post with its comments, a patient with their samples and centre), and those had no right owner. The rules meant to protect the folders cost more thought than they saved. When no folder means ownership, a misplaced file breaks nothing and is fixed by renaming it.

```
src/
  routes/       thin pages, compose components freely
  components/   every app component, flat; a complex one gets its own folder
  hooks/        hooks shared by several components, flat
  ui/           shadcn primitives and generic components
  data/
    <feature>/  api.ts, reader.server.ts, service.server.ts
    use-cases/  <action>.server.ts
  lib/          code that would make sense in any app
  platform/     infrastructure singletons and adapters (db client and schema, mailer, env)
```

## The data layer

- **`api.ts`**: what components import. Query keys (prefixed by the feature), Valibot schemas, server functions and their `queryOptions`/`mutationOptions`. It ships to the client as RPC stubs, so its handlers stay thin.
- **`reader.server.ts`**: read-only Drizzle queries. It imports nothing from `data/`, so readers can never form a cycle.
- **`service.server.ts`**: writes on its own feature. A service may import any reader, never another service. For example, the comments service reads the posts reader to check that the post exists.
- **`data/use-cases/<action>.server.ts`**: an operation that needs services of several features (deleting an account deletes its posts). A use case imports services and readers, never another use case.
- A query that spans features goes to the feature of its main entity, the one in the URL or first in the name: `getPostWithComments` lives in `data/posts/`.

## Considered Options

- **Feature folders with a public interface (ADR 0001).** Rejected: cross-feature screens have no owner, and every file needs a public-or-internal decision.
- **Layers first, then a folder per feature inside each layer.** Rejected: `post-details.tsx` still needs an owner, posts or comments.
- **Services calling each other.** Rejected: services end up importing each other in a cycle and stop being understandable alone. Use cases take the composition.
- **"Repository" for the Drizzle files.** Rejected: the word invites one CRUD object per table and then a service layer above it. Readers and services hold the business logic directly.

## Consequences

- Dependency direction, enforced by Biome `noRestrictedImports`: `routes → components | hooks | ui | data`, `components → hooks | ui | data`, `data → platform | lib`, `ui → lib`, `platform → lib`. Inside `data/`: readers import no `data/` file, services import only readers, use cases import services and readers.
- A component gets a folder when it needs its own hook or context, has subcomponents used only by it, or grows too big. Its `index.ts` exports only what outside code may use. `noBarrelFile` is off for `src/components/*/index.ts` only, and `@/components/*/*` imports are forbidden. These are the only public-interface rules left.
- The database schema stays central in `platform/`.
- No `utils/` or `types/` folders and no generic file names (`utils.ts`, `helpers.ts`). The fixed names `api.ts`, `reader.server.ts`, `service.server.ts` and `index.ts` are the exception.
- `noImportCycles` is turned on if the pinned Biome version has it.
- Where auth (better-auth instance, permission statement, middlewares, pages, email templates) and the app shell go is settled in ADR 0003.
