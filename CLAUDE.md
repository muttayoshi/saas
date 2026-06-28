# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical: Next.js 16

This repo runs **Next.js 16**, which has breaking changes vs. earlier versions. `apps/web/AGENTS.md` says: read the relevant guide in `node_modules/next/dist/docs/` before writing app code, and heed deprecation notices. Concrete consequences already in the tree:

- **Middleware is `proxy.ts`, not `middleware.ts`.** `apps/web/src/proxy.ts` exports a `proxy(request)` function (delegating to `updateSession`). The `apps/admin` app still uses the older `middleware.ts` convention — don't assume both apps are identical.
- `cookies()` and `headers()` are async — always `await` them (see `apps/web/src/lib/supabase/server.ts`).

## Commands

Run from the repo root (Turborepo fans out to all workspaces):

```bash
pnpm install            # node >=22, pnpm >=11 required
pnpm dev                # web on :3000 (--turbopack), admin on :3001
pnpm build              # build all apps/packages
pnpm lint               # web app only (admin has no lint script)
pnpm typecheck          # tsc --noEmit across workspaces
pnpm format             # prettier --write across the repo
```

Scope a task to one app: `pnpm --filter @app/web dev` (or `@app/admin`).
There is **no test runner configured** in this repo yet.

## Architecture

Turborepo + pnpm monorepo. Two Next.js App Router apps share four internal packages.

**Apps** (`apps/`)

- `web` (`@app/web`) — customer-facing, bilingual marketplace. Route groups: `(main)` public pages (`franchise`, `property`, `jobs` with `[slug]` detail + `_components`), `(auth)` login/register, and `dashboard` (the seller/user portal, with subroutes per entity: franchises, properties, jobs, leads, applications, saved, profile).
- `admin` (`@app/admin`) — internal admin panel, runs on port 3001.

**Packages** (`packages/`)

- `@app/types` — **the domain source of truth.** Zod schemas + inferred TS types for every entity (`franchise`, `property`, `job`, `leads`, `profile`, `common`). Each entity exports a base `XSchema`, plus `CreateXSchema`/`UpdateXSchema` derived via `.omit()`/`.partial()`, and bilingual label maps (e.g. `FranchiseCategoryLabels`). Import types from here; don't redefine shapes locally.
- `@app/utils` — shared helpers: `i18n` (bilingual `t()` + `uiTranslations`), `currency`, `date`, `slug`, `string`.
- `@app/ui` — shared shadcn/ui config/deps. Note: the `web` app currently keeps its own copy of UI primitives under `apps/web/src/components/ui`; `admin` consumes `@app/ui`.
- `@app/typescript-config` — shared `tsconfig` bases (`base.json`, `nextjs.json`).

Workspace packages are consumed by source (`main`/`types` point at `./src/index.ts`) and listed in each app's `transpilePackages` (see `apps/web/next.config.ts`, which also transpiles `react-map-gl`/`mapbox-gl`).

### Supabase (backend)

PostgreSQL + Auth + Storage + RLS on Supabase Cloud, accessed via `@supabase/ssr`. Three client factories per app under `src/lib/supabase/`:

- `client.ts` — `createBrowserClient` for Client Components.
- `server.ts` — `createServerClient` bound to `await cookies()`, for Server Components / route handlers.
- `middleware.ts` — `updateSession()` refreshes the auth session and runs route guards; invoked from `proxy.ts`.

**Auth & roles.** `profiles` extends `auth.users`; a DB trigger (`handle_new_user`) auto-creates a profile row on signup, reading `role`/`full_name` from `raw_user_meta_data` (default role `investor`). The `user_role` enum is `franchise_owner | investor | landlord | worker`. The admin app additionally gates on `profile.role === 'admin'` in its middleware. Route protection happens in two layers: middleware/proxy redirects, and Server Component layouts (e.g. `dashboard/layout.tsx` re-checks the user and redirects to `/login`).

**Schema & RLS.** SQL migrations live in `supabase/migrations/` and are applied with the repo runner (`pnpm db:migrate`, tracking `public.schema_migrations`). The Supabase dashboard also tracks timestamped history in `supabase_migrations.schema_migrations`; keep it aligned after repo-runner migrations are applied. `006_rls_policies.sql` remains a historical stub, while `007_storage_buckets.sql` is the idempotent repo source for storage buckets and storage-object policies.

### i18n

Bilingual Indonesian (`id`, default) / English (`en`). There is no routing-based locale; instead use the `t({ id, en }, locale)` helper and `uiTranslations` from `@app/utils`, plus the per-entity label maps in `@app/types`. Indonesian is the default and primary language — UI copy is authored `id`-first.

## Conventions

- Path alias `@/*` → `apps/<app>/src/*`.
- Co-locate route-specific components in a `_components/` folder beside the route.
- Images: only Supabase Storage public URLs are whitelisted in `next.config.ts` `images.remotePatterns`.
- Env vars: copy `.env.example` → `.env.local`. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`.
- `sharp` is the only allow-listed build dependency (`.npmrc`, `pnpm-workspace.yaml`).
