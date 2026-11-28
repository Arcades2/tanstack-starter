# tanstack-starter

The template repository every Derived app is created from.

## Conventions

**Starter**: the template repository (tanstack-starter) every Derived app is created from once, then diverges from freely.

**Derived app**: an app created from the Starter. It does not receive the Starter's later changes automatically.

**Tooled rules**: conventions enforced by configuration shipped in the Starter (formatter, linter, type checker, folder layout). They travel with each Derived app.
_Avoid_: lint rules (too narrow)

**Conduct rules**: conventions an agent or developer must follow that no tool enforces, written in prose. Those about the Starter's stack (architecture, naming, form of the code) live in the Starter and travel with each Derived app. Those about ways of working common to all of one developer's repos live outside the Starter, which never points to them.
_Avoid_: guidelines, best practices

**Invariant**: a convention that must always hold, such as an architecture boundary, a security check or a data-integrity guarantee. Breaking one is a defect; it is made a Tooled rule whenever possible.
_Avoid_: hard rule

**Style**: a convention about the form of code that aims for consistency, not conformance. It is shown by examples and neighbouring code; a deviation is pointed out, never treated as a defect.
_Avoid_: code style (suggests formatting, which is a Tooled rule)

## Architecture

**Feature**: one business subject of a Derived app (posts, comments, patients). Only the domain layer has a folder per feature (`domain/<feature>/`); elsewhere a feature shows only in names: component file names, query keys, i18n keys.
_Avoid_: module (used for any unit of code), domain (`domain/` names the layer that holds every feature, not one feature)

**Reader**: a server-only file of read-only database queries for one feature (`domain/<feature>/reader.server.ts`). Any service or use case may call it.

**Service**: a server-only file of the writes on one feature (`domain/<feature>/service.server.ts`). A service never calls another service.
_Avoid_: repository

**Use case**: a server-only operation that combines services of several features (`domain/use-cases/<action>.server.ts`).
_Avoid_: workflow, action, command

**Factory**: a test helper that inserts one record of a feature with valid default values, lets the test override any of them, and returns it. Tests build their data with factories, never with the development seed.
_Avoid_: fixture (suggests static data), seed (names the fake data for local development)

**Smart component**: a component that fetches the server data it displays itself, instead of receiving that data from its parent. The route that mounts it preloads that data.
_Avoid_: container component

## Access

**Permission**: the right to perform one action on one resource (for example, create a post). Code checks permissions, never roles.

**Role**: a named set of permissions given to a user. The Starter ships two, user and admin; a role's content can change without touching the code that checks permissions.
_Avoid_: group, profile
