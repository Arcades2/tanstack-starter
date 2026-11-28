# One transaction per mutation request

A mutation either writes everything or nothing. Each request that writes runs inside one database transaction, opened by a middleware around its handler, and every write in the domain layer goes through the transaction it is given. The data layer decision ("Couche données : accès, server functions, erreurs") let each composition open its own transaction; that made forgetting one, or reading outside it, easy and silent.

## The middleware

`platform/db/transaction.ts` exports `runInTransaction(fn)`, which calls `db.transaction`, collects after-commit effects, and runs them through `waitUntil` only once the commit succeeded. On rollback they are dropped.

`src/middleware/transaction.ts` exports `transactionMiddleware`, a **request** middleware built on `runInTransaction`. It puts `tx` and `afterCommit` in the context. Being a request middleware, the same one fits server functions and server route methods (`POST: { middleware: [transactionMiddleware], handler }`).

- It is listed explicitly on each server function or server route method that writes. It is not global.
- It commits when the handler succeeds, and also when the handler throws a `redirect`.
- It rolls back on any other thrown error (which then follows the usual `AppError` path), and on a server route `Response` that is not `ok`.
- Reads (`GET` server functions) run outside any transaction.

```ts
export const publishPostFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware, transactionMiddleware])
  .validator(publishPostSchema)
  .handler(({ context: { tx, afterCommit, user }, data }) =>
    publishPost(tx, afterCommit, user, data));
```

## Signatures

- `Tx` is derived from `db` (`Parameters<Parameters<typeof db.transaction>[0]>[0]`).
- Services and use cases take `tx: Tx` as their first, required parameter.
- Readers take a required `executor: Db | Tx`, with no default. A reader called inside a mutation must get `tx`, or it reads over another connection and misses the uncommitted writes; without a default, forgetting it is a type error. Read server functions pass `db`.
- Forgetting the middleware leaves no `tx` to pass, so it does not compile either.
- Services and use cases never call `tx.transaction()` (savepoints) by default; a use case may, case by case, to recover from a failed sub-operation.

## Side effects and external calls

- Effects outside the database (emails, later cache invalidation) go through `afterCommit(fn)`, used by use cases and handlers only. A failed effect does not undo the mutation.
- No external call while `tx` is open: no `fetch`, no email, no `auth.api`. A mutation that needs an external call before writing uses a server function without `transactionMiddleware` and calls `runInTransaction` after that call.
- The transaction connection sets short `statement_timeout` and `idle_in_transaction_session_timeout` (about 10 s), so a forgotten slow call fails fast instead of hitting the 60 s Netlify Functions limit.
- One user action is one request: a form never fires two mutations in a row. An action touching several features is one use case behind one server function (Conduct rule).

## Isolation

Postgres default, `READ COMMITTED`. Lost updates are prevented case by case with conditional updates (`WHERE version = …`) or `SELECT … FOR UPDATE`; no `SERIALIZABLE`, no global retry.

## What escapes

better-auth writes through its own adapter and transactions, never in our `tx`. App reactions to auth events (`databaseHooks`) are not atomic with them and must be safe to replay.

## Considered Options

- **A global function middleware on every `POST`.** Rejected: it opens a transaction (and a WebSocket handshake) for posts that write nothing, leaves no way to make an external call before the transaction, and needs the HTTP method inside a function middleware.
- **The handler calls `db.transaction` itself.** Rejected: no shared `afterCommit`, and each handler repeats the commit and rollback rules.
- **Readers default to `db`.** Rejected: a reader called without `tx` inside a mutation compiles and reads stale data.

## Consequences

- To check while building: the run order between `authMiddleware` (function middleware) and `transactionMiddleware` (request middleware) in one server function's list.
- Integration tests pass their own `tx` to the domain layer, which fits the rollback-per-test strategy.
- The blog example must show a mutation using `afterCommit` and one making an external call before `runInTransaction`.
