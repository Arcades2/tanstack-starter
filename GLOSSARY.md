# Glossary

**Starter**: this repository; a GitHub template repo from which every new app is created once, then diverges freely.

**Derived app**: an app created from the Starter. It does not receive the Starter's later changes automatically.

**Tooled rules**: conventions enforced by configuration shipped in the Starter (formatter, linter, type checker, folder layout). They travel with each Derived app.
_Avoid_: lint rules (too narrow)

**Conduct rules**: conventions an agent or developer must follow that no tool enforces (architecture, naming, ways of working). Their single source of truth lives in the agents-home repo; the Starter points to it.
_Avoid_: guidelines, best practices

**Feature**: a folder of Derived app code grouped around one business subject, owning all the domain code about that subject. Every piece of domain code belongs to exactly one feature.
_Avoid_: module (used for any unit of code), domain

**Aggregate feature**: a feature whose purpose is to compose other features (a dashboard, an account page). It is an ordinary feature, not a separate kind of folder.

**Smart component**: a component that fetches the server data it displays itself, instead of receiving that data from its parent. The route that mounts it preloads that data.
_Avoid_: container component
