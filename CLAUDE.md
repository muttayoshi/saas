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
pnpm lint               # web app only (ESLint flat config; admin has no lint script)
pnpm typecheck          # tsc --noEmit across workspaces
pnpm format             # prettier --write across the repo
```

Scope a task to one app: `pnpm --filter @app/web dev` (or `@app/admin`).
There is **no test runner configured** in this repo yet.

## Architecture

Turborepo + pnpm monorepo. This is a **SaaS starter** (pruned from an earlier marketplace codebase) scoped to authentication + user/profile. Two Next.js App Router apps share four internal packages.

**Apps** (`apps/`)

- `web` (`@app/web`) — customer-facing app. Route groups: `(main)` public landing (`page.tsx` home only), `(auth)` login/register + `auth/callback`, and `dashboard` (the signed-in user portal, currently `page.tsx` overview + `profile`). Add new feature routes here.
- `admin` (`@app/admin`) — internal admin panel, runs on port 3001. Currently just dashboard overview + `users` management (list + `[id]` account editor).

**Packages** (`packages/`)

- `@app/types` — **the domain source of truth.** Zod schemas + inferred TS types. Currently `profile` (incl. `UserRoleSchema`/`UserRoleLabels`, `RegisterSchema`, `LoginSchema`, `UpdateProfileSchema`) and `common`. Add new entities as `XSchema` + derived `Create`/`Update` variants; import types from here, don't redefine shapes locally.
- `@app/utils` — shared helpers: `i18n` (bilingual `t()` + `uiTranslations`), `currency`, `date`, `slug`, `string`.
- `@app/ui` — shared shadcn/ui config/deps. Note: the `web` app currently keeps its own copy of UI primitives under `apps/web/src/components/ui`; `admin` consumes `@app/ui`.
- `@app/typescript-config` — shared `tsconfig` bases (`base.json`, `nextjs.json`).

Workspace packages are consumed by source (`main`/`types` point at `./src/index.ts`) and listed in each app's `transpilePackages` (see `apps/web/next.config.ts`). That config still transpiles `react-map-gl`/`mapbox-gl`, but maps are no longer used — safe to drop when convenient.

### Supabase (backend)

PostgreSQL + Auth + Storage + RLS on Supabase Cloud, accessed via `@supabase/ssr`. Three client factories per app under `src/lib/supabase/`:

- `client.ts` — `createBrowserClient` for Client Components.
- `server.ts` — `createServerClient` bound to `await cookies()`, for Server Components / route handlers.
- `middleware.ts` — `updateSession()` refreshes the auth session and runs route guards; invoked from `proxy.ts`.

**Auth & roles.** `profiles` extends `auth.users`; a DB trigger (`handle_new_user`) auto-creates a profile row on signup, reading `role`/`full_name` from `raw_user_meta_data` (default role `user`). The `user_role` enum is `user | admin`. The admin app additionally gates on `profile.role === 'admin'` in its middleware. Route protection happens in two layers: middleware/proxy redirects, and Server Component layouts (e.g. `dashboard/layout.tsx` re-checks the user and redirects to `/login`). A `public.is_admin()` SECURITY DEFINER helper backs the admin RLS policy without recursion.

**Schema & RLS.** SQL migrations live in `supabase/migrations/` and are applied with the repo runner (`pnpm db:migrate`, tracking `public.schema_migrations`; reads `DIRECT_URL`). Two migrations: `001_create_profiles.sql` (enum, `profiles` table, `handle_new_user`/`update_updated_at` triggers, `is_admin()`, and profiles RLS — self-contained, runs clean on a fresh DB) and `002_storage_avatars.sql` (public `avatars` bucket + owner-scoped object policies). Each migration runs in its own transaction and is recorded in `schema_migrations`.

### i18n

Bilingual Indonesian (`id`, default) / English (`en`). There is no routing-based locale; instead use the `t({ id, en }, locale)` helper and `uiTranslations` from `@app/utils`, plus per-entity label maps in `@app/types` (currently just `UserRoleLabels`). Indonesian is the default and primary language — UI copy is authored `id`-first.

## Conventions

- Path alias `@/*` → `apps/<app>/src/*`.
- Co-locate route-specific components in a `_components/` folder beside the route.
- Images: only Supabase Storage public URLs are whitelisted in `next.config.ts` `images.remotePatterns`.
- Env vars: copy `.env.example` → `.env.local`. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the client factories read `ANON_KEY`; set it to the project's publishable key value). `DATABASE_URL`/`DIRECT_URL` are needed only for `pnpm db:migrate`. `NEXT_PUBLIC_MAPBOX_TOKEN` is unused (maps were removed). `.env.local` is git-ignored.
- Create an admin: `node --env-file=.env.local apps/web/create-admin.mjs` (needs the Auth API reachable), or insert into `auth.users` with `raw_user_meta_data` `{"role":"admin"}` so the trigger sets the role.
- Allow-listed native build deps (`pnpm-workspace.yaml` `allowBuilds`): `sharp` and `unrs-resolver` (the Rust resolver pulled in by `eslint-config-next`). New deps with install scripts are blocked until added here.
- **Linting:** Next 16 removed `next lint`. The web app uses ESLint 9 flat config at `apps/web/eslint.config.mjs`, which spreads the native flat config from `eslint-config-next` (no `FlatCompat`). Script: `eslint .`.
