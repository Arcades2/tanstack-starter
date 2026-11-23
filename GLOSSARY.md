# Glossary

**Starter**: this repository; a GitHub template repo from which every new app is created once, then diverges freely.

**Derived app**: an app created from the Starter. It does not receive the Starter's later changes automatically.

**Tooled rules**: conventions enforced by configuration shipped in the Starter (formatter, linter, type checker, folder layout). They travel with each Derived app.
_Avoid_: lint rules (too narrow)

**Conduct rules**: conventions an agent or developer must follow that no tool enforces (architecture, naming, ways of working). Their single source of truth lives in the agents-home repo; the Starter points to it.
_Avoid_: guidelines, best practices
