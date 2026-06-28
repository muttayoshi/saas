# Admin Config — Merchant Category, Merchant & Property CRUD

**Date:** 2026-06-25
**App scope:** `apps/admin` (`@app/admin`), with a shared types change in `@app/types`, a DB migration in `supabase/migrations/`, and a new migration runner script. The customer-facing `web` app is intentionally **not** modified.

## Goal

Add a new **"Konfigurasi"** group to the admin sidebar containing three CRUD sub-pages:

1. **Kategori Merchant** (Merchant Category) — CRUD over a new `merchant_categories` lookup table.
2. **Merchant** — CRUD over the existing `franchises` table (Merchant == Franchise, rebranded).
3. **Properti** (Property) — CRUD over the existing `properties` table.

Also deliver a repeatable **local → Supabase migration workflow** (the repo currently has no Supabase CLI).

## Decisions (from brainstorming)

- **Merchant = the existing `franchises` entity**, rebranded. No new "merchant" table.
- **Merchant Category becomes a real DB table** (`merchant_categories`) so categories can be added/edited/removed via CRUD. Currently categories are a hardcoded Postgres `franchise_category` enum + `FranchiseCategoryLabels` map in `@app/types`.
- **`franchises` references categories via a FK** (`category_id`).
- All three CRUD pages delivered in this iteration.
- Migrations applied via a **lightweight Node migration runner** (not the Supabase CLI).

## Key constraint: do not break the `web` app

`franchises.category` is a Postgres enum used by ~5 files in the customer `web` app (franchise list, `[slug]` detail, filters, card, and the seller's create/edit **franchise-form** which _writes_ `category`). A naive switch to a `NOT NULL category_id` FK would break the web seller form on insert.

### Strategy: FK + bidirectional sync trigger (web app: zero changes)

1. Create `merchant_categories`, seed from the 7 existing enum values.
2. Convert `franchises.category` from the `franchise_category` enum to **`TEXT`** (stores the slug); drop the `franchise_category` enum type.
3. Add **nullable** `franchises.category_id UUID REFERENCES merchant_categories(id) ON DELETE RESTRICT`.
4. Add a `BEFORE INSERT OR UPDATE` trigger `franchises_sync_category` that keeps the two columns consistent:
   - If `category_id` is provided → set `category` = that category's `slug` (admin write path).
   - Else if `category` (slug) is provided and `category_id` is null → look up and set `category_id` (legacy web write path).
5. Backfill: set `category_id` for all existing rows by matching `category` slug.

Result: admin writes `category_id` (relational, supports CRUD-managed categories); the web app keeps reading/writing the `category` slug exactly as today; both columns stay in sync. Categories newly added via admin CRUD that aren't in the web app's hardcoded label map fall back gracefully on the web side (the franchise card already renders `?? f.category`).

**Out of scope (explicitly):** surfacing newly-added categories in the customer `web` app's franchise form dropdown / filters. The web franchise form keeps using the 7 hardcoded enum slugs this iteration.

## Data model

### `merchant_categories` (new)

| column     | type        | notes                                               |
| ---------- | ----------- | --------------------------------------------------- |
| id         | UUID PK     | `gen_random_uuid()`                                 |
| slug       | TEXT UNIQUE | NOT NULL, e.g. `fnb`                                |
| name_id    | TEXT        | NOT NULL — Indonesian label                         |
| name_en    | TEXT        | NOT NULL — English label                            |
| sort_order | INT         | NOT NULL DEFAULT 0                                  |
| is_active  | BOOLEAN     | NOT NULL DEFAULT true                               |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now()                              |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now(); `update_updated_at` trigger |

Seed (from `FranchiseCategoryLabels`): `fnb` (Makanan & Minuman / Food & Beverage), `retail`, `jasa` (Jasa / Services), `pendidikan` (Pendidikan / Education), `kesehatan` (Kesehatan & Kecantikan / Health & Beauty), `laundry`, `otomotif` (Otomotif / Automotive), with sort_order 1..7.

### `franchises` (altered)

- `category`: `franchise_category` enum → **`TEXT NOT NULL`** (slug).
- `category_id`: new **nullable** `UUID REFERENCES merchant_categories(id) ON DELETE RESTRICT`.
- Index on `category_id`.
- Drop `franchise_category` enum type after the column conversion.
- Trigger `franchises_sync_category` (see strategy above).

### `properties` (unchanged schema)

CRUD operates on the existing table. `property_type` stays a hardcoded enum (no "Property Category" was requested).

## Migration & RLS

New migration file: `supabase/migrations/008_merchant_categories.sql`, containing, in order:

1. `merchant_categories` table + `update_updated_at` trigger + indexes.
2. Seed rows (idempotent: `INSERT ... ON CONFLICT (slug) DO NOTHING`).
3. `franchises` column conversion, `category_id` FK + index, backfill, drop enum type.
4. `franchises_sync_category` trigger + function.
5. RLS: enable + policies for `merchant_categories`:
   - public/anon `SELECT` on `is_active = true` rows (parity with how franchises/properties are publicly readable).
   - admin full `INSERT/UPDATE/DELETE` via `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text = 'admin')`.
6. Admin write policies for `franchises` and `properties` (admin CRUD needs insert/update/delete; today these are owner-scoped). Add admin-override policies using the same `role::text = 'admin'` check. **Verify** the live `user_role` enum actually contains `admin` (the admin layout already gates on `role === 'admin'`); if not, the migration adds it via `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin'`.

### Migration runner

- `scripts/migrate.mjs` — uses the `pg` package, connects via `process.env.DIRECT_URL`, ensures a `schema_migrations(version TEXT PK, applied_at TIMESTAMPTZ)` table, then applies every `supabase/migrations/*.sql` not yet recorded, in filename order, each in a transaction. Idempotent and safe to re-run.
- `scripts/seed.mjs` — applies `supabase/seed.sql` the same way (optional, manual).
- Root `package.json` scripts: `"db:migrate": "node scripts/migrate.mjs"`, `"db:seed": "node scripts/seed.mjs"`.
- Add `pg` and `dotenv` as root dev dependencies; load `.env.local` then `.env` in the script.
- README note in `supabase/` documenting `pnpm db:migrate`.

## Types (`@app/types`)

- New `src/merchant-category.ts`: `MerchantCategorySchema`, `CreateMerchantCategorySchema` (omit `id`/timestamps), `UpdateMerchantCategorySchema` (`.partial()`); exported from `src/index.ts`.
- `src/franchise.ts`: add `category_id: z.string().uuid().nullable()` to `FranchiseSchema`. Keep `category` (now a plain `z.string()` slug rather than the enum) for web-app compatibility; keep `FranchiseCategorySchema`/`FranchiseCategoryLabels` exports (still used by the web app). Admin create/update franchise uses `category_id`.

## Admin UI

### Sidebar (`apps/admin/src/components/layout/sidebar-nav.tsx`)

Refactor the flat nav to support an expandable group. Add a **"Konfigurasi"** group (`Settings` icon) with children:

- Kategori Merchant → `/dashboard/config/merchant-categories`
- Merchant → `/dashboard/config/merchants`
- Properti → `/dashboard/config/properties`

Existing top-level items (Overview, Merchant List, Properti, Pengguna) stay. The group auto-expands when the current path is under `/dashboard/config`. Active-state logic mirrors the current implementation.

### Pages (new, under `apps/admin/src/app/dashboard/config/`)

Shared pattern per entity:

- `page.tsx` (Server Component): fetch rows via server Supabase client, render a list table.
- `_components/`: a client `*-table` (rows + Edit/Delete actions), a client `*-form-dialog` (Add/Edit form built from the shared `dialog`, `input`, `textarea`, `select`, `label`, `button` primitives), validated with the Zod schema from `@app/types`.
- `actions.ts`: Next.js **Server Actions** (`"use server"`) for create/update/delete, using the server Supabase client (RLS enforces admin); `revalidatePath` after each mutation. Each action validates input with the entity's `Create`/`Update` Zod schema and returns a typed result for inline form errors.

**merchant-categories**: fields slug, name_id, name_en, sort_order, is_active. Delete blocked by FK (`ON DELETE RESTRICT`) when a category is in use → surface a friendly error.

**merchants** (`franchises`): core fields — name, category (`<select>` populated from `merchant_categories`, writes `category_id`), description, investment_start/end, franchise_fee, status, outlet_count, established_year. `slug` auto-generated from name via `@app/utils` `slug` helper; `owner_id` set to the current admin user (or a chosen owner — default current user) on create.

**properties**: core fields — title, property_type (`<select>` from `PropertyTypeLabels`), address, city, province, monthly_rent, size_sqm, status. `slug` auto-generated; `landlord_id` defaults to current admin user on create.

## Testing / verification

No test runner exists in the repo. Verification is manual + static:

- `pnpm typecheck` and `pnpm lint` pass.
- `pnpm db:migrate` runs cleanly against the dev Supabase project and is idempotent on a second run; `schema_migrations` records `007`.
- Manual smoke in the admin app (port 3001): create/edit/delete a category; create a merchant selecting a DB category and confirm both `category_id` and `category` slug are set; confirm the existing web franchise list/detail still render; create/edit/delete a property.
- Regression check: creating a franchise from the **web** seller form still works (trigger backfills `category_id`).

## Risks / notes

- **`user_role` enum** may not contain `admin` on the live DB (the admin layout already gates on `role === 'admin'`, so it very likely does). **Confirm enum contents first** as the first implementation step. If `admin` is missing, add it with `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin'`. On Postgres 12+ this is safe inside the runner's per-file transaction _because the new value is never used as an enum literal in the same transaction_ — RLS policies compare via `role::text = 'admin'` (a text comparison), not the enum label directly. So no special non-transactional handling is needed.
- RLS policy names must not collide with existing policies applied via the Supabase MCP. Use `DROP POLICY IF EXISTS` guards.
- The migration runner needs `DIRECT_URL` in `.env.local`; document this.
