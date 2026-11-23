# Feature-based architecture with no shared folder

Derived app code is grouped by feature (`src/features/<name>/`), because grouping by layer scatters each subject across many folders. Past feature-based projects decayed because their `shared/` folder became a dumping ground for domain code that had no owner. So there is deliberately no `shared/` folder. Code outside features lives in three spaces, and each one admits only code that knows nothing about the domain: `ui/` (shadcn primitives and generic components), `lib/` (code that would make sense in any app) and `platform/` (infrastructure singletons and adapters: database client, auth, mailer, env). All domain code belongs to exactly one feature. A feature may import another, which is how aggregate features such as the app shell are built.

## Considered Options

- **Features may not import each other, only routes compose them.** Rejected: code that two features need gets pushed into a shared folder, which is the original failure.
- **A barrel `index.ts` as each feature's public interface.** Rejected: a barrel would mix client code with `.server.ts` code, which breaks TanStack Start's import protection, and it slows Vite in dev. A feature's public interface is its root files instead, and its subfolders are internal.
- **Biome's `noPrivateImports` (`@package`) to hide internals.** Rejected: `@package` reaches only the same folder and its subfolders, so it cannot fit the per-type subfolders inside a feature.
- **Database schema per feature.** Rejected: foreign keys cross features, migrations are global and auth tables have no owning feature. The schema is central in `platform/`. Features own their queries, not their tables.

## Consequences

- Import rules are enforced with Biome alone: `noRestrictedImports` forbids `@/features/*/*/**` (no deep imports into a feature) and scopes the dependency direction `routes → features → platform | ui | lib`, `ui → lib`, `platform → lib`. `noBarrelFile` is on.
- Folders inside a feature come from a closed list (`components/`, `hooks/`, `server/`, plus whatever the data layer adds). There is never a `utils/` or a `types/`, and no generic file names (`utils.ts`, `helpers.ts`).
- Whether a piece of code is domain-free is decided in review. No tool checks it.
