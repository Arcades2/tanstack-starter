# Glossary

**Starter**: this repository; a GitHub template repo from which every new app is created once, then diverges freely.

**Derived app**: an app created from the Starter. It does not receive the Starter's later changes automatically.

**Tooled rules**: conventions enforced by configuration shipped in the Starter (formatter, linter, type checker, folder layout). They travel with each Derived app.
_Avoid_: lint rules (too narrow)

**Conduct rules**: conventions an agent or developer must follow that no tool enforces (architecture, naming, ways of working). Their single source of truth lives in the agents-home repo; the Starter points to it.
_Avoid_: guidelines, best practices

**Feature**: one business subject of a Derived app (posts, comments, patients). Only the data layer has a folder per feature (`data/<feature>/`); elsewhere a feature shows only in names: component file names, query keys, i18n keys.
_Avoid_: module (used for any unit of code), domain

**Reader**: a server-only file of read-only database queries for one feature (`data/<feature>/reader.server.ts`). Any service or use case may call it.

**Service**: a server-only file of the writes on one feature (`data/<feature>/service.server.ts`). A service never calls another service.
_Avoid_: repository

**Use case**: a server-only operation that combines services of several features (`data/use-cases/<action>.server.ts`).
_Avoid_: workflow, action, command

**Smart component**: a component that fetches the server data it displays itself, instead of receiving that data from its parent. The route that mounts it preloads that data.
_Avoid_: container component

**Permission**: the right to perform one action on one resource (for example, create a post). Code checks permissions, never roles.

**Role**: a named set of permissions given to a user. The Starter ships two, user and admin; a role's content can change without touching the code that checks permissions.
_Avoid_: group, profile
