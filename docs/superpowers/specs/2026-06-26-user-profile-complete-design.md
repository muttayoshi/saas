# User Profile — Complete Profile, Preferences & Lookups

**Date:** 2026-06-26
**App scope:** `supabase/migrations/` (two new migrations), `@app/types` (new + extended schemas), `apps/admin` (lookup config CRUD + user list/detail pages), `apps/web` (expanded dashboard profile form).

## Goal

The current `profiles` table is thin (role, name, email, phone, bio, company, free-text city/province). Enrich the user model so it captures demographic data and investment preferences, with proper relational lookups — using the legacy Friendchised user JSON as a **reference only** (not a faithful port).

Deliver the whole feature (DB + types + admin UI + dashboard UI) as one design, broken into sequential, self-contained implementation tasks.

## Decisions (from brainstorming)

- **Fresh design, not a legacy port.** Native Supabase/UUID model. Drop everything Supabase Auth already owns: `verified`, `phone_verified_at`, `google_auth`, `has_set_password`, `must_change_password`.
- **Lookups = mixed strategy.** Admin-managed DB tables for `cities`, `professions`, `investor_types`, `business_models`, `partnership_models` (following the existing `merchant_categories` pattern). Code enums for `gender` and `education` (fixed, short lists). Interest categories reuse the existing `merchant_categories` table.
- **Include** `username`, `subscribe_newsletter`, and storage columns for gamification (`gamification_point`, `is_gamification`) and `total_token` — columns only; the points/token _logic_ is out of scope.
- **Skip** `code`, `flag`, `age` (derived from `birth_date`), `is_user_interest` (derived from existence of a `user_preferences` row), and merchant ownership (`merchants` / `admin_merchants` / `merchant_group` — that is the merchant domain, separate work).
- **Two cities per user, two distinct meanings:** `profiles.city_id` = domicile; `user_preferences.preferred_city_id` = investment target.

## Key constraint: do not break existing profile usage

`profiles` already has free-text `city` and `province` columns, written by the **web** dashboard profile form. We **add** `city_id` (nullable FK) alongside them rather than replacing. New UI (admin + the expanded web form) uses the structured `city_id` dropdown; the legacy `city`/`province` text columns are left in place (deprecated, untouched) so nothing breaks. No backfill is attempted (no reliable text→FK mapping).

## Data model

### Enums (Postgres + `@app/types`)

- `gender_type`: `male` | `female`. Labels: Laki-laki / Perempuan (id), Male / Female (en).
- `education_level`: `sd` | `smp` | `sma` | `d3` | `s1` | `s2` | `s3`. Labels id-first (SD, SMP, SMA/SMK, Diploma (D3), Sarjana (S1), Magister (S2), Doktor (S3)).

### Lookup tables (new) — shared shape

All five follow the `merchant_categories` shape: `id UUID PK gen_random_uuid()`, `slug TEXT UNIQUE NOT NULL`, `name_id TEXT NOT NULL`, `name_en TEXT NOT NULL`, `sort_order INT NOT NULL DEFAULT 0`, `is_active BOOLEAN NOT NULL DEFAULT true`, `created_at`/`updated_at TIMESTAMPTZ` + `update_updated_at` trigger. Indexes on `sort_order` and `is_active`.

| table                | extra columns                         | seed                                                                                                                                              |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cities`             | `code TEXT`, `province TEXT NOT NULL` | a starter set of major Indonesian cities (e.g. Jakarta, Surabaya, Bandung, Medan, Semarang, Makassar, Bali/Denpasar) with province; admin extends |
| `professions`        | —                                     | starter set (Karyawan Swasta, Wiraswasta, PNS/ASN, Profesional, Mahasiswa, Lainnya)                                                               |
| `investor_types`     | —                                     | starter set (Pemula, Berpengalaman, Institusi)                                                                                                    |
| `business_models`    | —                                     | starter set (Autopilot, Semi-autopilot, Mandiri)                                                                                                  |
| `partnership_models` | —                                     | starter set (Beli Putus, Bagi Hasil, Lisensi)                                                                                                     |

Seed values are reasonable defaults the admin can rename/extend; exact copy finalized during implementation. All seeds idempotent (`INSERT ... ON CONFLICT (slug) DO NOTHING`).

> Note: `cities.province` is stored as text on the city row (not its own lookup) — YAGNI for now.

### `profiles` (altered — migration B)

Add nullable columns (all additive, no drops):

| column                 | type                                                  | notes                                                 |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `username`             | TEXT UNIQUE                                           | nullable                                              |
| `birth_date`           | DATE                                                  | age derived from this                                 |
| `birth_place`          | TEXT                                                  |                                                       |
| `gender`               | `gender_type`                                         | nullable                                              |
| `education`            | `education_level`                                     | nullable                                              |
| `profession_id`        | UUID REFERENCES professions(id) ON DELETE SET NULL    | replaces legacy free-text job_role/job_industry       |
| `investor_type_id`     | UUID REFERENCES investor_types(id) ON DELETE SET NULL |                                                       |
| `city_id`              | UUID REFERENCES cities(id) ON DELETE SET NULL         | domicile; coexists with legacy `city`/`province` text |
| `subscribe_newsletter` | BOOLEAN NOT NULL DEFAULT false                        |                                                       |
| `gamification_point`   | INTEGER NOT NULL DEFAULT 0                            | storage only                                          |
| `is_gamification`      | BOOLEAN NOT NULL DEFAULT false                        | storage only                                          |
| `total_token`          | INTEGER NOT NULL DEFAULT 0                            | storage only                                          |

Indexes on `city_id`, `profession_id`, `investor_type_id`. Existing `city`/`province` TEXT columns: unchanged, deprecated.

### `user_preferences` (new, 1:1 — migration B)

| column                    | type                                                           | notes                       |
| ------------------------- | -------------------------------------------------------------- | --------------------------- |
| `id`                      | UUID PK                                                        | `gen_random_uuid()`         |
| `user_id`                 | UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE | enforces 1:1                |
| `budget_min`              | BIGINT                                                         | nullable (rupiah)           |
| `budget_max`              | BIGINT                                                         | nullable (rupiah)           |
| `preferred_city_id`       | UUID REFERENCES cities(id) ON DELETE SET NULL                  | investment-target city      |
| `business_model_id`       | UUID REFERENCES business_models(id) ON DELETE SET NULL         |                             |
| `partnership_model_id`    | UUID REFERENCES partnership_models(id) ON DELETE SET NULL      |                             |
| `target_roi`              | NUMERIC(5,2)                                                   | nullable, ROI % expectation |
| `created_at`/`updated_at` | TIMESTAMPTZ                                                    | `update_updated_at` trigger |

### `user_preference_categories` (new, 1:many join — migration B)

| column                 | type                                                               | notes               |
| ---------------------- | ------------------------------------------------------------------ | ------------------- |
| `id`                   | UUID PK                                                            | `gen_random_uuid()` |
| `user_id`              | UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE            |                     |
| `merchant_category_id` | UUID NOT NULL REFERENCES merchant_categories(id) ON DELETE CASCADE |                     |
| `created_at`           | TIMESTAMPTZ NOT NULL DEFAULT now()                                 |                     |

`UNIQUE (user_id, merchant_category_id)`. Index on `user_id`.

### Relationship map

```
profiles ──1:1── user_preferences ──*:1── cities (preferred_city)
   │                    └──*:1── business_models, partnership_models
   ├──*:1── cities (city_id, domicile), professions, investor_types
   └──1:*── user_preference_categories ──*:1── merchant_categories
```

## Migrations & RLS

Two new files, applied via the existing `pnpm db:migrate` runner; both idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `DROP POLICY IF EXISTS` guards), recorded in `schema_migrations`.

**`011_user_lookups.sql`**

1. `gender_type` + `education_level` enums (`CREATE TYPE` guarded via `DO $$ ... IF NOT EXISTS`).
2. The five lookup tables + indexes + `update_updated_at` triggers.
3. Idempotent seeds.
4. RLS per lookup table: public/anon `SELECT` where `is_active = true` (these populate dropdowns in both apps); admin full `INSERT/UPDATE/DELETE` via `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text = 'admin')`.

**`012_user_profile_extension.sql`**

1. `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ...` for every new column + the FK indexes.
2. `user_preferences` table + trigger + RLS.
3. `user_preference_categories` table + indexes + RLS.
4. RLS for the two user tables:
   - owner: `SELECT/INSERT/UPDATE/DELETE` where `user_id = auth.uid()` (the web dashboard form path).
   - admin: full access via the `role::text = 'admin'` check (admin user-detail edit path).
   - No public/anon read.
5. `profiles` already has owner + (assumed) admin policies; if an admin read/update policy on `profiles` is missing, add it here (guarded) so the admin user pages can read/edit any profile.

Reuse the shared `update_updated_at()` function from migration 001. Policy names guarded with `DROP POLICY IF EXISTS` to avoid collisions with MCP-applied policies. Confirm `user_role` enum contains `admin` (it does per existing admin gating); add via `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'admin'` if not.

## Types (`@app/types`)

- **New files**, each with base schema + `Create*` (omit id/timestamps) + `Update*` (`.partial()`), exported from `src/index.ts`:
  - `src/city.ts`, `src/profession.ts`, `src/investor-type.ts`, `src/business-model.ts`, `src/partnership-model.ts` — the four model files share the `merchant_categories` shape; `city.ts` adds `code`/`province`.
  - `src/user-preference.ts` — `UserPreferenceSchema`, `CreateUserPreferenceSchema`, `UpdateUserPreferenceSchema`; plus `UserPreferenceCategorySchema`.
- **`src/profile.ts`** — extend `ProfileSchema` with the new fields (all `.nullable()` / defaulted). Add `GenderSchema` + `GenderLabels`, `EducationLevelSchema` + `EducationLabels` (bilingual maps, id-first). Extend `UpdateProfileSchema` to include the new editable fields. Keep `RegisterSchema`/`LoginSchema` unchanged.

## Admin UI (`apps/admin`, port 3001)

### Lookup config CRUD — `/dashboard/config/...`

Five new sub-pages mirroring the existing `config/merchant-categories` pattern exactly (Server Component `page.tsx` list + `_components/*-table` + `*-form-dialog` + `actions.ts` Server Actions validated with the entity Zod schema, `revalidatePath` after mutations):

`cities` (extra fields code, province), `professions`, `investor-types`, `business-models`, `partnership-models`.

Add them under the existing **"Konfigurasi"** sidebar group in `sidebar-nav.tsx`. Delete blocked by FK in-use → friendly error (FKs use `SET NULL`/`CASCADE`, so deletes mostly succeed; surface DB errors generically).

### User list — `/dashboard/users` (route stub already linked in sidebar)

Server Component with server-side filters (mirror the new `apps/admin/.../properties` list pattern): search by name/email/phone, filter by role and city, pagination. Columns: name, email, phone, role, city (domicile), created_at. Row → detail.

### User detail — `/dashboard/users/[id]`

Section layout mirroring the property-detail pages, view + inline edit per section via Server Actions:

- **Akun** — name, email (read-only), phone, role, username, avatar, subscribe_newsletter, gamification_point, total_token.
- **Data Diri** — birth_date, birth_place, gender, education, profession, city (domicile), investor_type.
- **Preferensi Investasi** — budget_min/max, preferred city, business_model, partnership_model, target_roi (reads/writes `user_preferences`, upsert on save).
- **Kategori Minat** — multi-select over `merchant_categories`, persisted to `user_preference_categories` (diff add/remove on save).

Dropdowns populated from the lookup tables (active rows). All writes go through admin RLS.

## Dashboard UI (`apps/web`)

Expand `apps/web/src/app/dashboard/profile/_components/profile-form.tsx` (and its `page.tsx` data load) so users self-edit: **Data Diri** (birth_date, birth_place, gender, education, profession, city, investor_type) + **Preferensi Investasi** (budget, preferred city, business/partnership model, target_roi → upsert `user_preferences`) + **Kategori Minat** (multi-select → `user_preference_categories`). Lookups fetched server-side and passed as props. Writes scoped by owner RLS (`user_id = auth.uid()`). Legacy `city`/`province` text inputs are replaced in the form by the `city_id` dropdown.

## Implementation tasks (sequential)

| #   | Phase      | Task                                       | Output                                                                                                |
| --- | ---------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1   | Foundation | Migration `011_user_lookups.sql`           | enums + 5 lookup tables + seeds + RLS                                                                 |
| 2   | Foundation | Migration `012_user_profile_extension.sql` | extend `profiles` + `user_preferences` + `user_preference_categories` + RLS                           |
| 3   | Foundation | Types in `@app/types`                  | lookup schemas, user-preference schema, extended profile + gender/education label maps, index exports |
| 4   | Admin      | Lookup config CRUD                         | 5 config pages + sidebar entries                                                                      |
| 5   | Admin      | User list page                             | `/dashboard/users` with server-side filters                                                           |
| 6   | Admin      | User detail page                           | `/dashboard/users/[id]` — 4 sections, view + edit                                                     |
| 7   | Dashboard  | Expanded web profile form                  | data diri + preferensi + kategori minat                                                               |

Order: 1→2→3 first (foundation). Then 4 (lookups must exist before dropdowns). Then 5, 6, 7.

## Testing / verification

No test runner in the repo. Verification is manual + static:

- `pnpm typecheck` and `pnpm lint` pass.
- `pnpm db:migrate` applies 010 & 011 cleanly and is idempotent on re-run; `schema_migrations` records both.
- Admin smoke (port 3001): CRUD each lookup; open user list with filters; open a user detail and edit each section (Akun, Data Diri, Preferensi, Kategori) and confirm persistence including the preferences upsert and category add/remove diff.
- Web smoke (port 3000): a logged-in user edits their profile + preferences + interest categories; reload confirms persistence; RLS prevents reading another user's preferences.
- Regression: the existing web profile form still saves; the legacy `city`/`province` columns are untouched.

## Risks / notes

- **`user_role` enum / `admin` value** — confirm present (admin app already gates on it); guard with `ADD VALUE IF NOT EXISTS`.
- **RLS policy name collisions** with MCP-applied policies — guard every `CREATE POLICY` with `DROP POLICY IF EXISTS`.
- **Two `city` representations** on `profiles` (`city_id` vs legacy `city`/`province` text) is intentional, temporary redundancy; a future migration can backfill+drop the text columns once the web form fully migrates.
- **Lookup table count** — five new admin CRUD pages is the bulk of the UI work; they are near-identical to `merchant-categories`, so factor a shared generic config-table/form helper if duplication becomes painful (optional, decide during task 4).
- Gamification/token columns are **storage only** this iteration — no accrual logic, no UI to mutate beyond admin manual edit.
