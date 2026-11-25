# Domain layer, auth, middleware, emails and app shell placement

Amends [ADR 0002](0002-layered-flat-layout.md).

ADR 0002 left auth and the app shell without a place. Settling it also renamed the data layer: `data/` holds the boundary between the UI and the business (`api.ts` ships to the client as RPC stubs) and any business operation, such as a CSV export, so "data" described it badly. It becomes `domain/`.

```
src/
  routes/
    _public.tsx         header + footer
    _public/_auth.tsx   centered card, redirects signed-in users
    _protected.tsx      guard + <AppShell><Outlet /></AppShell>
  components/           app-shell.tsx, app-nav.tsx, app-user-menu.tsx, public-header.tsx, ...
  domain/
    <feature>/          api.ts, reader.server.ts, service.server.ts
    auth/               api.ts, instance.server.ts, permissions.ts, client.ts
    use-cases/          <action>.server.ts
  middleware/           auth.ts, then cross-cutting server function middlewares
  emails/               React Email templates, flat: auth-verify-email.tsx
  hooks/  ui/  lib/  platform/
```

## Auth

Auth is a feature folder in `domain/`, not part of `platform/`: its config names business resources in its permissions and adds fields to the user. It is the one feature folder with files beyond the fixed names:

- **`instance.server.ts`**: the better-auth instance. It renders the auth email templates and sends them through the mailer.
- **`permissions.ts`**: the `createAccessControl` statement and the roles. Isomorphic, because the client needs it for `adminClient` and to show or hide permission-gated UI.
- **`client.ts`**: the better-auth client. Only `domain/auth/api.ts` imports it; components never do.
- **`api.ts`**: `getSession` and its `queryOptions` (used by route `beforeLoad`s), `mutationOptions` wrapping `client.ts` for sign-in, sign-up, password reset and profile updates, and the admin server functions, which call `auth.api` directly since better-auth already provides those operations.

Auth pages live under `_public/_auth/`; profile and admin pages under `_protected/`.

## Middleware

Server function middlewares live in `src/middleware/`, flat: `auth.ts` (`authMiddleware`, `requirePermission`), and later the cross-cutting ones (error masking, logging). A middleware is glue between the web server and the domain, not domain code. With it outside `domain/`, no feature imports `domain/auth/` directly. The dependency is moved, not removed: `domain/*/api.ts → middleware → domain/auth/`. This is provisional and may be revisited.

## Emails

React Email templates live in `src/emails/`, flat, with the feature in the name. They are not app UI (no shadcn, no runtime Tailwind), and placing them in `components/`, which may import the domain, would invite cycles.

## App shell

`AppShell` is a plain component (`components/app-shell.tsx`) composing the shadcn Sidebar, `app-nav.tsx` and `app-user-menu.tsx`. The public layout has no shell: its route composes `public-header.tsx` and `public-footer.tsx`. `theme-switcher.tsx` is flat, shared by both.

## Component folders

This replaces ADR 0002's criterion. A component gets a folder only when it has subcomponents that make no sense without it (a list item without its list), needs its own hook or context, or grows too big. A subcomponent that stands on its own, like the user menu, stays flat even if only one component uses it today.

## Considered Options

- **`server/` or `backend/` instead of `domain/`.** Rejected: `api.ts` is not server-only, and the name would clash with the `.server.ts` suffix.
- **`core/`.** Rejected: too vague, it turns into a dumping ground.
- **`features/`.** Rejected: it suggests UI lives there too, as in ADR 0001.
- **better-auth instance in `platform/`.** Rejected: it needs `platform → emails` and `routes → platform`, and puts code that changes with every new permission in the infrastructure.
- **Middlewares in `domain/auth/`.** Rejected: every feature's `api.ts` would import another feature, and cross-cutting middlewares would have no home.
- **A separate `_auth` layout beside `_public`.** Rejected: nesting it keeps the binary `_public` / `_protected` split.

## Consequences

- Dependency direction, replacing ADR 0002's: `routes → components | hooks | ui | domain`, `components → hooks | ui | domain`, `domain → middleware | emails | platform | lib`, `middleware → domain/auth/{instance.server,permissions} | platform | lib`, `emails → lib`, `ui → lib`, `platform → lib`.
- Inside `domain/`: readers import no `domain/` file; a service imports any reader; a use case imports services and readers; `api.ts` imports its own feature's reader and service, any reader, use cases and `middleware/`, never another feature's service.
- `domain/auth/client.ts` is imported only by `domain/auth/api.ts`.
- Code checks permissions, never role names (Conduct rule).
