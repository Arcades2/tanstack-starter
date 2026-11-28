# Telling production from previews at Netlify runtime

Research for [issue #27](https://github.com/Arcades2/tanstack-starter/issues/27). Question: inside the Netlify Function that serves TanStack Start SSR (built with `@netlify/vite-plugin-tanstack-start`), what lets code tell production from a Deploy Preview, a branch deploy and a local build (`netlify serve`, local production build for Playwright e2e)? What is `NODE_ENV` in each?

Researched 2026-11-28. Sources pinned where possible:

- Netlify docs, `.md` versions of the pages on docs.netlify.com.
- `netlify/framework-adapters` @ `5c0ac3e` (`@netlify/vite-plugin-tanstack-start` 1.3.20, `@netlify/vite-plugin` 3.1.0).
- `netlify/primitives` @ `9aaef51`.
- `netlify/cli` @ `fa12c66`.
- `@netlify/serverless-functions-api` 2.31.0 (published npm bundle).
- `vitejs/vite` main (Vite 8.4.0).
- `TanStack/router` @ `10b22c2` (`@tanstack/react-start` 1.169.7).

## Answer

| Context | `process.env.CONTEXT` at function runtime | `context.deploy.context` (request-scoped) | `process.env.NODE_ENV` in the SSR bundle |
|---|---|---|---|
| Production deploy | No | `production` (to validate) | `"production"`, baked in at build |
| Deploy Preview | No | `deploy-preview` (to validate) | `"production"`, baked in at build |
| Branch deploy | No | `branch-deploy` (to validate) | `"production"`, baked in at build |
| `netlify serve` | Not documented (to validate) | Probably `""` | `"production"`, baked in at build |
| Local `vite build` + server for e2e | No (unless you set it) | `""` or no Netlify context | `"production"`, baked in at build |
| `vite dev` | No | No Netlify function in the SSR path | `"development"` |

1. **`CONTEXT` is a build-only variable.** It does not reach `process.env` in a deployed function. `DEPLOY_PRIME_URL` and `DEPLOY_URL` don't either. Only `URL`, `SITE_NAME` and `SITE_ID` do. Issue #24's assumption ("MSW forced off when Netlify `CONTEXT=production`, read in `platform/env`") is **wrong as written**: at runtime `CONTEXT` is `undefined` everywhere, so the guard would never fire.
2. **`NODE_ENV` can't tell production from previews.** TanStack Start statically replaces `process.env.NODE_ENV` in the build output, and `vite build` sets it to `"production"`. Every built artifact therefore says `"production"`: prod, previews, branch deploys, local builds.
3. **What works:**
   - (a) Bake `CONTEXT` into the bundle at build time (Netlify's own documented pattern for SSR).
   - (b) Use a Netlify UI/CLI/API environment variable with per-deploy-context values.
   - (c) Read `context.deploy.context` through `getContext()` / `Netlify.context`, inside a request only.

## Evidence

### `CONTEXT` and the other read-only variables are build-time only

- Netlify lists `CONTEXT` among the read-only variables "automatically set for your builds": "name of the build's deploy context. It can be `production`, `deploy-preview`, `branch-deploy`, or `dev`." It also says that "as these are build variables specifically, you will need to take extra steps" to use them after the build. Source: https://docs.netlify.com/build/configure-builds/environment-variables/#read-only-variables
- Functions get only three of them: "Netlify offers a number of read-only environment variables during the build step, but only the following variables are available to serverless functions during runtime: `URL` […] `SITE_NAME` […] `SITE_ID`". Source: https://docs.netlify.com/build/functions/environment-variables/
- Same page: "environment variables declared in a Netlify configuration file (`netlify.toml`) are not available to serverless functions." So `[context.production.environment]` in `netlify.toml` does not help at runtime either. Also: "Each deploy, including Deploy Previews and branch deploys, uses the environment variable values that were set at the time of deployment."
- For SSR specifically, Netlify says to copy the value in the build command: "To access Netlify configuration or read-only variables in SSR or DSG pages, create variables with these values in the build command". Its example is `command = "REACT_APP_CONTEXT=$CONTEXT npm run build"`. Source: https://docs.netlify.com/build/frameworks/use-environment-variables-with-frameworks/#netlify-variables

### The Vite plugin does nothing about env

`@netlify/vite-plugin-tanstack-start` only wraps `@netlify/vite-plugin` with `build.enabled: true` ([main.ts](https://github.com/netlify/framework-adapters/blob/5c0ac3e6088ba3d0371d375e49167acde916cadb/packages/vite-plugin-tanstack-start/src/main.ts)). The build plugin writes `.netlify/v1/functions/server.mjs`, which re-exports the SSR entry's `fetch` on `path: "/*"`. It defines no variable and injects no `CONTEXT` ([build.ts](https://github.com/netlify/framework-adapters/blob/5c0ac3e6088ba3d0371d375e49167acde916cadb/packages/vite-plugin/src/lib/build.ts)). The SSR handler is therefore an ordinary Netlify Function, and the function rules above apply to it.

In dev, the plugin starts a `NetlifyDev` emulation as Vite middleware (functions, blobs, redirects, env vars). The plugin returns `[]` when `NETLIFY_DEV` is set, that is, under the Netlify CLI ([main.ts](https://github.com/netlify/framework-adapters/blob/5c0ac3e6088ba3d0371d375e49167acde916cadb/packages/vite-plugin/src/main.ts)). `NetlifyDev` resolves config with `context: 'dev'` ([primitives dev/src/main.ts](https://github.com/netlify/primitives/blob/9aaef511171ed36ef22e802f51baec04b5f9e143/packages/dev/src/main.ts)). That governs which env values are loaded. It does not set a `CONTEXT` variable.

### Runtime sources that do work

- **`context.deploy.context`.** The function `Context` object has `deploy.context`, "the context of the deploy that the function belongs to", plus `deploy.id` and `deploy.published`. Source: https://docs.netlify.com/build/functions/api/#deploy. Possible context names: `production`, `deploy-preview`, `branch-deploy`, `preview-server`, `dev`, and branch names as custom contexts (https://docs.netlify.com/deploy/deploy-overview/#deploy-contexts).
- **`getContext()` from `@netlify/functions`** "Returns the Context object for the current request. Useful in scopes where you can't directly access the handler arguments - for example, inside a web framework". It "Throws when called outside an active request" (https://docs.netlify.com/build/functions/api/#getcontext; source: [get_context.ts](https://github.com/netlify/primitives/blob/9aaef511171ed36ef22e802f51baec04b5f9e143/packages/functions/prod/src/lib/get_context.ts)).
- **`Netlify.context`** is a getter that returns the request store's context, or `null` outside a request. **`Netlify.env`** is a thin wrapper over `process.env` (`get: e => process.env[e]`), so it sees nothing `process.env` doesn't. Sources: [runtime/src/lib/globals.ts](https://github.com/netlify/primitives/blob/9aaef511171ed36ef22e802f51baec04b5f9e143/packages/runtime/src/lib/globals.ts) and `@netlify/serverless-functions-api` 2.31.0 `dist/globals.d.ts` / `dist/index.js` (`globalThis.Netlify = { get context(){ … ?? null }, env: { get: e => pn.env[e], … } }`).
- **The value comes from a platform header.** In `@netlify/serverless-functions-api` 2.31.0, `getDeployObject` builds `deploy` from request headers: `context: headers.get("x-nf-deploy-context") ?? ""`, `branch: headers.get("x-nf-branch") ?? ""`, `published: headers.get("x-nf-deploy-published") === "1"` (`dist/deploy.d.ts`, `dist/index.js`). Netlify's edge injects that header in production. The local functions server in `netlify/cli` sets `x-nf-client-connection-ip`, `x-nf-account-id` and `x-nf-site-id`, but not `x-nf-deploy-context` ([server.ts#L166](https://github.com/netlify/cli/blob/fa12c66c6185a34a0fe0aae2f622e971cf338d6e/src/lib/functions/server.ts#L166)). Locally, `deploy.context` is therefore probably `""`. This is inferred from source, not documented.
- **Limit for MSW.** The value exists only per request. Issue #24 starts `msw/node` "au boot du serveur", at module scope, where `Netlify.context` is `null` and `getContext()` throws. TanStack Start's docs warn the same way: "Read env per-request, not at module scope" ([environment-variables.md](https://github.com/TanStack/router/blob/10b22c276ea785fcc9cc051011a4a1541ec2d0b4/docs/start/framework/react/guide/environment-variables.md)).

### Environment variables with per-context values

Variables set in the Netlify UI, CLI or API reach functions at runtime through `process.env`. They can carry one value per deploy context: Production, Deploy Previews, Branch deploys, a specific branch, Preview server, Local development. "By default, environment variables are available to all scopes and have the same value for all deploy contexts." Restricting scopes is a Pro+ feature, and a scope must include **Functions** to reach a function. Sources: https://docs.netlify.com/build/environment-variables/overview/#value-per-deploy-context, https://docs.netlify.com/build/functions/environment-variables/

Locally, `netlify dev` uses the `dev` context values by default, and `--context production` switches them (https://docs.netlify.com/api-and-cli-guides/cli-guides/local-development/). `netlify serve` accepts `--context` too. Its help text says "(default: dev)", but `BaseCommand.getDefaultContext()` returns `'production'` for `serve` and `'dev'` otherwise ([serve/index.ts](https://github.com/netlify/cli/blob/fa12c66c6185a34a0fe0aae2f622e971cf338d6e/src/commands/serve/index.ts), [base-command.ts#L870-L922](https://github.com/netlify/cli/blob/fa12c66c6185a34a0fe0aae2f622e971cf338d6e/src/commands/base-command.ts#L870-L922)). Pass `--context` explicitly rather than trusting either.

### `NODE_ENV`

- **Netlify build:** "By default, Netlify's build system does not set any value for `NODE_ENV` (so it defaults to `undefined`)", and setting it to `production` skips `devDependencies` (https://docs.netlify.com/build/configure-builds/manage-dependencies/#node-js-environment). Netlify documents no `NODE_ENV` for the function runtime.
- **`vite build`** sets `process.env.NODE_ENV = "production"` in the build process when it is unset. `build.ts` calls `resolveConfig(inlineConfig, 'build', 'production', 'production', …)`, and `config.ts` sets `process.env.NODE_ENV = defaultNodeEnv` before running plugin `config` hooks ([config.ts](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/config.ts), [build.ts](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/build.ts)). The docs table: `vite build` → `NODE_ENV` `"production"` ([env-and-mode.md](https://github.com/vitejs/vite/blob/main/docs/guide/env-and-mode.md#node_env-and-modes)).
- **Vite alone would keep** `process.env` dynamic in server environments: `keepProcessEnv` defaults to `consumer === 'server'` ([config.ts#L1070](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/config.ts), [define.ts](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/plugins/define.ts)).
- **TanStack Start overrides that on build.** With `server.build.staticNodeEnv` (default `true`), its plugin adds a user `define` of `'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || opts.mode || 'production')` when `command === 'build'` ([planning.ts#L167-L173](https://github.com/TanStack/router/blob/10b22c276ea785fcc9cc051011a4a1541ec2d0b4/packages/start-plugin-core/src/vite/planning.ts#L167-L173), [schema.ts#L234](https://github.com/TanStack/router/blob/10b22c276ea785fcc9cc051011a4a1541ec2d0b4/packages/start-plugin-core/src/schema.ts#L234)). User defines apply to every environment, including SSR. Result: `"production"` is baked into every built bundle, the same on prod, previews, branch deploys and local builds, unless someone sets `NODE_ENV` in the build environment.
- **`vite dev`:** nothing is baked in, and the Vite process sets `NODE_ENV` to `"development"` (`defaultNodeEnv = 'development'`).
- A dependency left external that reads `process.env.NODE_ENV` at runtime would see whatever the Lambda environment holds. Netlify does not document that value.

## Recommendation for the MSW guard (#24)

The rule ("MSW forced off in production, previews and local builds follow the flags") can stay. Only the signal changes.

1. **Bake the deploy context at build time** (pattern documented by Netlify for SSR). In `vite.config.ts`, read `process.env.CONTEXT`, which is present in the Netlify build environment, and expose it under an app-owned name. One way: `define: { 'process.env.NETLIFY_CONTEXT': JSON.stringify(process.env.CONTEXT ?? '') }`. Another: prefix it (`VITE_NETLIFY_CONTEXT=$CONTEXT vite build`) and read `import.meta.env`. This value exists at module scope, so it works for an MSW server started at boot.
   - Caveat: `define` replaces the member expression `process.env.NETLIFY_CONTEXT` only. With t3-env, list the key explicitly in `runtimeEnv` / `runtimeEnvStrict` (`NETLIFY_CONTEXT: process.env.NETLIFY_CONTEXT`). Passing `runtimeEnv: process.env` as a whole object would not see the define.
2. **Make it fail-closed.** An artifact built outside Netlify CI, for example `vite build` then `netlify deploy --prod --no-build`, has no `CONTEXT`. Treating "unknown" as "not production" would leave MSW on in prod. Safer: allow MSW only when the baked context is one of `deploy-preview`, `branch-deploy` or `dev`, and have the local e2e build set it explicitly (`CONTEXT=dev vite build`, or the app-owned variable directly).
3. **Alternative without build tricks:** a Netlify UI/CLI/API variable such as `MSW_ALLOWED` with per-context values (unset in Production, `true` for Deploy Previews and Branch deploys). It is read from `process.env` at runtime. The downside is that it lives outside the repo, and every derived app must recreate it.
4. Do not use `NODE_ENV` (always `"production"` in a build). Do not use `context.deploy.context` for a boot-time decision (request-scoped only). Do not use `[context.*.environment]` in `netlify.toml` (not available to functions).

## To validate on a real preview deploy

- In a deployed function, log `process.env.CONTEXT`, `process.env.DEPLOY_PRIME_URL` and `process.env.NODE_ENV`. Expected: `undefined`, `undefined`, and an undocumented runtime `NODE_ENV`.
- Log `getContext().deploy.context` inside a request on prod, a Deploy Preview and a branch deploy. Check the strings are exactly `production`, `deploy-preview` and `branch-deploy`, and look at what `netlify serve` gives (expected `""`).
- Grep the built server bundle under `dist/server` for `"production"` where `process.env.NODE_ENV` was, to confirm the static replacement with the starter's real config.
- Confirm the baked `NETLIFY_CONTEXT` (or `VITE_` variant) differs between the prod and preview builds. Confirm `netlify serve` without `--context` builds with `CONTEXT=production`, because the CLI help text and code disagree.
