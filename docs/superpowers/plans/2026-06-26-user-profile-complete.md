# User Profile — Complete Profile, Preferences & Lookups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the `profiles` user model with demographic data, an investment-preferences table, interest-category links, and five admin-managed lookup tables — surfaced in admin (config CRUD + user list/detail) and the web dashboard profile form.

**Architecture:** Two idempotent SQL migrations add enums, five lookup tables, profile columns, and two user-owned tables. `@app/types` gains Zod schemas mirroring the `merchant-category.ts` pattern. The admin app reuses the existing config-CRUD pattern via one shared generic lookup component, plus a property-list-style user list and a property-detail-style user detail. The web profile form is expanded with lookup-driven dropdowns and a preferences upsert.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), Supabase (`@supabase/ssr`), PostgreSQL + RLS, Zod, react-hook-form (web only), Tailwind + local shadcn/ui primitives, the repo's `pnpm db:migrate` runner (`pg`).

## Global Constraints

- **No test runner exists.** The "test" cycle for every task is: `pnpm typecheck` (from repo root) passes, and for DB tasks `pnpm db:migrate` applies cleanly **and is idempotent on a second run**. UI tasks add a manual smoke step. `pnpm lint` runs the web app only; admin has no lint.
- **Next.js 16 specifics:** `cookies()`/`headers()` are async — always `await`. `searchParams` and `params` in pages are **Promises** — `await` them. Admin uses `middleware.ts`; web uses `proxy.ts`. Before writing web app code, the engineer should heed `apps/web/AGENTS.md` (read `node_modules/next/dist/docs/` when unsure).
- **Migrations are append-only & idempotent:** new files `010_...` and `011_...`; use `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `DO $$ ... $$` guards for enums, and `DROP POLICY IF EXISTS` before every `CREATE POLICY`. Reuse the existing `update_updated_at()` function from migration 001. The runner connects via `DIRECT_URL` and records applied files in `schema_migrations`.
- **RLS admin check (verbatim pattern):** `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text = 'admin')`.
- **Types come from `@app/types`** — never redefine entity shapes locally. Each entity exports `XSchema`, `CreateXSchema` (`.omit({ id, created_at, updated_at })`), `UpdateXSchema` (`CreateXSchema.partial()`).
- **Copy is Indonesian-first (`id`).** Bilingual label maps use `Record<Key, { id: string; en: string }>`.
- **Admin server client import:** `import { createClient } from "@/lib/supabase/server"` then `const supabase = await createClient()`.
- **Path alias:** `@/*` → `apps/<app>/src/*`.
- **Do not break the existing web profile save** or the legacy `profiles.city` / `profiles.province` text columns.
- **Commit at the end of every task** with a `feat(...)`/`chore(...)` message; work happens on branch `feat/user-profile-complete`.

---

## File Structure

**Migrations** (`supabase/migrations/`)

- `011_user_lookups.sql` — enums + 5 lookup tables + seeds + RLS.
- `012_user_profile_extension.sql` — `profiles` columns + `user_preferences` + `user_preference_categories` + RLS.

**Types** (`packages/types/src/`)

- `city.ts`, `profession.ts`, `investor-type.ts`, `business-model.ts`, `partnership-model.ts` — lookup schemas.
- `user-preference.ts` — preference + preference-category schemas.
- `profile.ts` — extended (new columns, gender/education enums + label maps).
- `index.ts` — export the new files.

**Admin** (`apps/admin/src/`)

- `components/config/lookup-crud.tsx` — shared generic lookup CRUD client component.
- `app/dashboard/config/{cities,professions,investor-types,business-models,partnership-models}/{page.tsx,actions.ts}` — 5 lookup pages.
- `components/layout/sidebar-nav.tsx` — add 5 config entries.
- `app/dashboard/users/{page.tsx,_components/user-filters.tsx,_components/user-list-table.tsx}` — user list.
- `app/dashboard/users/[id]/{page.tsx,actions.ts,_components/{account-section,personal-section,preference-section,interest-section}.tsx}` — user detail.
- `lib/lookups.ts` — server helper to fetch active lookup rows for dropdowns.

**Web** (`apps/web/src/`)

- `app/dashboard/profile/page.tsx` — load lookups + preferences.
- `app/dashboard/profile/_components/profile-form.tsx` — expanded form.

---

## Task 1: Migration 010 — enums + lookup tables

**Files:**

- Create: `supabase/migrations/011_user_lookups.sql`

**Interfaces:**

- Produces tables: `cities(id,slug,code,name_id,name_en,province,sort_order,is_active,created_at,updated_at)`, `professions`, `investor_types`, `business_models`, `partnership_models` (last four share `id,slug,name_id,name_en,sort_order,is_active,created_at,updated_at`); enums `gender_type('male','female')`, `education_level('sd','smp','sma','d3','s1','s2','s3')`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/011_user_lookups.sql`:

```sql
-- =============================================================================
-- Migration 011: User lookups (enums + lookup tables)
-- =============================================================================

-- 1. Enums --------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE gender_type AS ENUM ('male', 'female');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE education_level AS ENUM ('sd', 'smp', 'sma', 'd3', 's1', 's2', 's3');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. cities -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  code        TEXT,
  name_id     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  province    TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cities_sort   ON cities(sort_order);
CREATE INDEX IF NOT EXISTS idx_cities_active ON cities(is_active);
DROP TRIGGER IF EXISTS cities_updated_at ON cities;
CREATE TRIGGER cities_updated_at BEFORE UPDATE ON cities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO cities (slug, code, name_id, name_en, province, sort_order) VALUES
  ('jakarta',   'JKT', 'Jakarta',   'Jakarta',   'DKI Jakarta',     1),
  ('bandung',   'BDG', 'Bandung',   'Bandung',   'Jawa Barat',      2),
  ('surabaya',  'SBY', 'Surabaya',  'Surabaya',  'Jawa Timur',      3),
  ('semarang',  'SMG', 'Semarang',  'Semarang',  'Jawa Tengah',     4),
  ('medan',     'MDN', 'Medan',     'Medan',     'Sumatera Utara',  5),
  ('makassar',  'MKS', 'Makassar',  'Makassar',  'Sulawesi Selatan',6),
  ('denpasar',  'DPS', 'Denpasar',  'Denpasar',  'Bali',            7),
  ('yogyakarta','YGY', 'Yogyakarta','Yogyakarta','DI Yogyakarta',   8)
ON CONFLICT (slug) DO NOTHING;

-- 3. Generic lookup tables (professions, investor_types, business_models,
--    partnership_models) -----------------------------------------------------
CREATE TABLE IF NOT EXISTS professions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE, name_id TEXT NOT NULL, name_en TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_professions_sort   ON professions(sort_order);
CREATE INDEX IF NOT EXISTS idx_professions_active ON professions(is_active);
DROP TRIGGER IF EXISTS professions_updated_at ON professions;
CREATE TRIGGER professions_updated_at BEFORE UPDATE ON professions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
INSERT INTO professions (slug, name_id, name_en, sort_order) VALUES
  ('karyawan-swasta', 'Karyawan Swasta', 'Private Employee', 1),
  ('wiraswasta',      'Wiraswasta',      'Entrepreneur',     2),
  ('pns-asn',         'PNS/ASN',         'Civil Servant',    3),
  ('profesional',     'Profesional',     'Professional',     4),
  ('mahasiswa',       'Mahasiswa',       'Student',          5),
  ('lainnya',         'Lainnya',         'Other',            6)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS investor_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE, name_id TEXT NOT NULL, name_en TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_investor_types_sort   ON investor_types(sort_order);
CREATE INDEX IF NOT EXISTS idx_investor_types_active ON investor_types(is_active);
DROP TRIGGER IF EXISTS investor_types_updated_at ON investor_types;
CREATE TRIGGER investor_types_updated_at BEFORE UPDATE ON investor_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
INSERT INTO investor_types (slug, name_id, name_en, sort_order) VALUES
  ('pemula',        'Pemula',        'Beginner',     1),
  ('berpengalaman', 'Berpengalaman', 'Experienced',  2),
  ('institusi',     'Institusi',     'Institutional',3)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS business_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE, name_id TEXT NOT NULL, name_en TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_business_models_sort   ON business_models(sort_order);
CREATE INDEX IF NOT EXISTS idx_business_models_active ON business_models(is_active);
DROP TRIGGER IF EXISTS business_models_updated_at ON business_models;
CREATE TRIGGER business_models_updated_at BEFORE UPDATE ON business_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
INSERT INTO business_models (slug, name_id, name_en, sort_order) VALUES
  ('autopilot',      'Autopilot',      'Autopilot',      1),
  ('semi-autopilot', 'Semi-autopilot', 'Semi-autopilot', 2),
  ('mandiri',        'Mandiri',        'Self-managed',   3)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS partnership_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE, name_id TEXT NOT NULL, name_en TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partnership_models_sort   ON partnership_models(sort_order);
CREATE INDEX IF NOT EXISTS idx_partnership_models_active ON partnership_models(is_active);
DROP TRIGGER IF EXISTS partnership_models_updated_at ON partnership_models;
CREATE TRIGGER partnership_models_updated_at BEFORE UPDATE ON partnership_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
INSERT INTO partnership_models (slug, name_id, name_en, sort_order) VALUES
  ('beli-putus', 'Beli Putus', 'Outright Purchase', 1),
  ('bagi-hasil', 'Bagi Hasil', 'Profit Sharing',    2),
  ('lisensi',    'Lisensi',    'License',           3)
ON CONFLICT (slug) DO NOTHING;

-- 4. RLS: public read of active rows; admin full write ------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cities','professions','investor_types','business_models','partnership_models']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_select_public', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (is_active = true)',
      t||'_select_public', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_admin_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text = ''admin'')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text = ''admin''))',
      t||'_admin_all', t);
  END LOOP;
END $$;
```

- [ ] **Step 2: Apply the migration**

Run: `pnpm db:migrate`
Expected: output shows `011_user_lookups.sql` applied; no errors.

- [ ] **Step 3: Verify idempotency**

Run: `pnpm db:migrate`
Expected: `010` is now skipped (already recorded); no errors, no duplicate-object failures.

- [ ] **Step 4: Spot-check seed + RLS in the DB**

Run (psql via the runner's `DIRECT_URL`, or Supabase SQL editor):
`SELECT count(*) FROM cities; SELECT count(*) FROM professions;`
Expected: `cities` = 8, `professions` = 6.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/011_user_lookups.sql
git commit -m "feat(db): migration 010 — user lookup tables + enums"
```

---

## Task 2: Migration 011 — profile extension + user tables

**Files:**

- Create: `supabase/migrations/012_user_profile_extension.sql`

**Interfaces:**

- Consumes: lookup tables + enums from Task 1.
- Produces: `profiles` columns (`username, birth_date, birth_place, gender, education, profession_id, investor_type_id, city_id, subscribe_newsletter, gamification_point, is_gamification, total_token`); tables `user_preferences(id,user_id,budget_min,budget_max,preferred_city_id,business_model_id,partnership_model_id,target_roi,created_at,updated_at)` and `user_preference_categories(id,user_id,merchant_category_id,created_at)`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/012_user_profile_extension.sql`:

```sql
-- =============================================================================
-- Migration 012: Profile extension + user preferences
-- =============================================================================

-- 1. Extend profiles ----------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username             TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date           DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_place          TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender               gender_type;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS education            education_level;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profession_id        UUID REFERENCES professions(id)    ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS investor_type_id     UUID REFERENCES investor_types(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city_id              UUID REFERENCES cities(id)         ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscribe_newsletter BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gamification_point   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_gamification      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_token          INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_city_id       ON profiles(city_id);
CREATE INDEX IF NOT EXISTS idx_profiles_profession_id ON profiles(profession_id);
CREATE INDEX IF NOT EXISTS idx_profiles_invtype_id    ON profiles(investor_type_id);

-- 2. user_preferences (1:1) ---------------------------------------------------
CREATE TABLE IF NOT EXISTS user_preferences (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  budget_min           BIGINT,
  budget_max           BIGINT,
  preferred_city_id    UUID REFERENCES cities(id)             ON DELETE SET NULL,
  business_model_id    UUID REFERENCES business_models(id)    ON DELETE SET NULL,
  partnership_model_id UUID REFERENCES partnership_models(id) ON DELETE SET NULL,
  target_roi           NUMERIC(5,2),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS user_preferences_updated_at ON user_preferences;
CREATE TRIGGER user_preferences_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. user_preference_categories (1:many) --------------------------------------
CREATE TABLE IF NOT EXISTS user_preference_categories (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES profiles(id)            ON DELETE CASCADE,
  merchant_category_id UUID NOT NULL REFERENCES merchant_categories(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, merchant_category_id)
);
CREATE INDEX IF NOT EXISTS idx_user_pref_categories_user ON user_preference_categories(user_id);

-- 4. RLS ----------------------------------------------------------------------
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preference_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_preferences_owner ON user_preferences;
CREATE POLICY user_preferences_owner ON user_preferences FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS user_preferences_admin ON user_preferences;
CREATE POLICY user_preferences_admin ON user_preferences FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text = 'admin'));

DROP POLICY IF EXISTS user_pref_categories_owner ON user_preference_categories;
CREATE POLICY user_pref_categories_owner ON user_preference_categories FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS user_pref_categories_admin ON user_preference_categories;
CREATE POLICY user_pref_categories_admin ON user_preference_categories FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text = 'admin'));

-- 5. Admin read/update on profiles (so admin user pages can view/edit anyone) --
DROP POLICY IF EXISTS profiles_admin_all ON profiles;
CREATE POLICY profiles_admin_all ON profiles FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role::text = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role::text = 'admin'));
```

- [ ] **Step 2: Apply + verify idempotency**

Run: `pnpm db:migrate` (then run it a second time)
Expected: `012_user_profile_extension.sql` applied first run, skipped second run, no errors.

- [ ] **Step 3: Spot-check the new columns**

Run: `SELECT username, birth_date, gender, city_id FROM profiles LIMIT 1;` and `SELECT * FROM user_preferences LIMIT 1;`
Expected: query succeeds (new columns exist; `user_preferences` empty is fine).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/012_user_profile_extension.sql
git commit -m "feat(db): migration 011 — profile extension + user preferences"
```

---

## Task 3: Types in `@app/types`

**Files:**

- Create: `packages/types/src/city.ts`, `profession.ts`, `investor-type.ts`, `business-model.ts`, `partnership-model.ts`, `user-preference.ts`
- Modify: `packages/types/src/profile.ts`, `packages/types/src/index.ts`

**Interfaces:**

- Produces: `City`, `CreateCity`, `UpdateCity`; `Profession`/`Create`/`Update`; `InvestorType`/…; `BusinessModel`/…; `PartnershipModel`/…; `UserPreference`/`CreateUserPreference`/`UpdateUserPreference`; `UserPreferenceCategory`; `Gender`, `GenderLabels`, `EducationLevel`, `EducationLabels`; extended `Profile` + `UpdateProfile`.

- [ ] **Step 1: Create the four simple lookup schemas**

Create `packages/types/src/profession.ts`:

```ts
import { z } from "zod"

export const ProfessionSchema = z.object({
  id: z.string().uuid(),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "slug hanya huruf kecil, angka, dan tanda hubung"),
  name_id: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  sort_order: z.number().int().min(0),
  is_active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type Profession = z.infer<typeof ProfessionSchema>

export const CreateProfessionSchema = ProfessionSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
})
export type CreateProfession = z.infer<typeof CreateProfessionSchema>

export const UpdateProfessionSchema = CreateProfessionSchema.partial()
export type UpdateProfession = z.infer<typeof UpdateProfessionSchema>
```

Create `packages/types/src/investor-type.ts`, `packages/types/src/business-model.ts`, `packages/types/src/partnership-model.ts` identically, replacing the names:

- `investor-type.ts` → `InvestorTypeSchema`, `InvestorType`, `CreateInvestorTypeSchema`, `CreateInvestorType`, `UpdateInvestorTypeSchema`, `UpdateInvestorType`.
- `business-model.ts` → `BusinessModelSchema`, `BusinessModel`, `CreateBusinessModelSchema`, `CreateBusinessModel`, `UpdateBusinessModelSchema`, `UpdateBusinessModel`.
- `partnership-model.ts` → `PartnershipModelSchema`, `PartnershipModel`, `CreatePartnershipModelSchema`, `CreatePartnershipModel`, `UpdatePartnershipModelSchema`, `UpdatePartnershipModel`.

(Body is byte-identical to `profession.ts` except the exported identifier names above.)

- [ ] **Step 2: Create the city schema (extra `code`/`province`)**

Create `packages/types/src/city.ts`:

```ts
import { z } from "zod"

export const CitySchema = z.object({
  id: z.string().uuid(),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "slug hanya huruf kecil, angka, dan tanda hubung"),
  code: z.string().max(10).nullable(),
  name_id: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  sort_order: z.number().int().min(0),
  is_active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type City = z.infer<typeof CitySchema>

export const CreateCitySchema = CitySchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
})
export type CreateCity = z.infer<typeof CreateCitySchema>

export const UpdateCitySchema = CreateCitySchema.partial()
export type UpdateCity = z.infer<typeof UpdateCitySchema>
```

- [ ] **Step 3: Create the user-preference schemas**

Create `packages/types/src/user-preference.ts`:

```ts
import { z } from "zod"

export const UserPreferenceSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  budget_min: z.number().int().min(0).nullable(),
  budget_max: z.number().int().min(0).nullable(),
  preferred_city_id: z.string().uuid().nullable(),
  business_model_id: z.string().uuid().nullable(),
  partnership_model_id: z.string().uuid().nullable(),
  target_roi: z.number().min(0).max(999.99).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type UserPreference = z.infer<typeof UserPreferenceSchema>

// For upsert from forms: everything except server-managed fields, all optional.
export const UpdateUserPreferenceSchema = UserPreferenceSchema.omit({
  id: true,
  user_id: true,
  created_at: true,
  updated_at: true,
}).partial()
export type UpdateUserPreference = z.infer<typeof UpdateUserPreferenceSchema>

export const UserPreferenceCategorySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  merchant_category_id: z.string().uuid(),
  created_at: z.string().datetime(),
})
export type UserPreferenceCategory = z.infer<typeof UserPreferenceCategorySchema>
```

- [ ] **Step 4: Extend `profile.ts`**

In `packages/types/src/profile.ts`, add the gender/education enums + label maps **after** the existing `UserRoleSchema` block, and add the new fields to `ProfileSchema` and `UpdateProfileSchema`.

Add these exports (place near the top, after `UserRole`):

```ts
export const GenderSchema = z.enum(["male", "female"])
export type Gender = z.infer<typeof GenderSchema>
export const GenderLabels: Record<Gender, { id: string; en: string }> = {
  male: { id: "Laki-laki", en: "Male" },
  female: { id: "Perempuan", en: "Female" },
}

export const EducationLevelSchema = z.enum(["sd", "smp", "sma", "d3", "s1", "s2", "s3"])
export type EducationLevel = z.infer<typeof EducationLevelSchema>
export const EducationLabels: Record<EducationLevel, { id: string; en: string }> = {
  sd: { id: "SD", en: "Elementary" },
  smp: { id: "SMP", en: "Junior High" },
  sma: { id: "SMA/SMK", en: "Senior High" },
  d3: { id: "Diploma (D3)", en: "Diploma" },
  s1: { id: "Sarjana (S1)", en: "Bachelor's" },
  s2: { id: "Magister (S2)", en: "Master's" },
  s3: { id: "Doktor (S3)", en: "Doctorate" },
}
```

Replace the `ProfileSchema` object with the extended version (keeps all existing fields, adds the new nullable ones):

```ts
export const ProfileSchema = z.object({
  id: z.string().uuid(),
  role: UserRoleSchema,
  full_name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  bio: z.string().max(500).nullable(),
  company_name: z.string().max(100).nullable(),
  city: z.string().max(100).nullable(),
  province: z.string().max(100).nullable(),
  // --- extended (migration 011) ---
  username: z.string().min(3).max(30).nullable(),
  birth_date: z.string().nullable(), // ISO date (YYYY-MM-DD)
  birth_place: z.string().max(100).nullable(),
  gender: GenderSchema.nullable(),
  education: EducationLevelSchema.nullable(),
  profession_id: z.string().uuid().nullable(),
  investor_type_id: z.string().uuid().nullable(),
  city_id: z.string().uuid().nullable(),
  subscribe_newsletter: z.boolean(),
  gamification_point: z.number().int().min(0),
  is_gamification: z.boolean(),
  total_token: z.number().int().min(0),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type Profile = z.infer<typeof ProfileSchema>
```

Replace `UpdateProfileSchema` with the extended editable set:

```ts
export const UpdateProfileSchema = ProfileSchema.pick({
  full_name: true,
  phone: true,
  bio: true,
  company_name: true,
  username: true,
  birth_date: true,
  birth_place: true,
  gender: true,
  education: true,
  profession_id: true,
  investor_type_id: true,
  city_id: true,
  subscribe_newsletter: true,
}).partial()
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>
```

- [ ] **Step 5: Export new files from `index.ts`**

In `packages/types/src/index.ts`, add after `export * from "./merchant-category"`:

```ts
export * from "./city"
export * from "./profession"
export * from "./investor-type"
export * from "./business-model"
export * from "./partnership-model"
export * from "./user-preference"
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors across workspaces). If `apps/web/src/app/dashboard/profile/_components/profile-form.tsx` errors because `ProfileSchema.pick({ city: true })` still works — it does (field retained) — no change needed here yet.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src
git commit -m "feat(types): user lookups, preferences & extended profile schemas"
```

---

## Task 4: Admin lookup config CRUD (5 pages + shared component)

**Files:**

- Create: `apps/admin/src/components/config/lookup-crud.tsx`
- Create: `apps/admin/src/app/dashboard/config/cities/{page.tsx,actions.ts}`
- Create: `apps/admin/src/app/dashboard/config/professions/{page.tsx,actions.ts}`
- Create: `apps/admin/src/app/dashboard/config/investor-types/{page.tsx,actions.ts}`
- Create: `apps/admin/src/app/dashboard/config/business-models/{page.tsx,actions.ts}`
- Create: `apps/admin/src/app/dashboard/config/partnership-models/{page.tsx,actions.ts}`
- Modify: `apps/admin/src/components/layout/sidebar-nav.tsx`

**Interfaces:**

- Consumes: lookup tables (Task 1), Zod schemas (Task 3).
- Produces: `LookupCrud` component; `LookupRow`, `LookupField`, `LookupActions` types; admin pages at `/dashboard/config/{slug}`.

- [ ] **Step 1: Write the shared `LookupCrud` component**

Create `apps/admin/src/components/config/lookup-crud.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { List, Pencil, Plus, Trash2 } from "lucide-react"

export type LookupRow = {
  id: string
  slug: string
  name_id: string
  name_en: string
  sort_order: number
  is_active: boolean
  [key: string]: unknown
}

export type LookupField = {
  name: string
  label: string
  type?: "text" | "number"
  placeholder?: string
  required?: boolean
}

export type ActionResult = { ok: true } | { ok: false; error: string }

export type LookupActions = {
  create: (formData: FormData) => Promise<ActionResult>
  update: (id: string, formData: FormData) => Promise<ActionResult>
  remove: (id: string) => Promise<ActionResult>
}

// Fields common to every lookup; pages pass `extraFields` (e.g. cities' code/province).
const BASE_FIELDS: LookupField[] = [
  { name: "slug", label: "Slug", placeholder: "jakarta", required: true },
  { name: "name_id", label: "Nama (ID)", placeholder: "Jakarta", required: true },
  { name: "name_en", label: "Nama (EN)", placeholder: "Jakarta", required: true },
]

function FormDialog({
  mode,
  row,
  fields,
  actions,
  trigger,
}: {
  mode: "create" | "edit"
  row?: LookupRow
  fields: LookupField[]
  actions: LookupActions
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res =
        mode === "create"
          ? await actions.create(formData)
          : await actions.update(row!.id, formData)
      if (res.ok === false) setError(res.error)
      else setOpen(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setError(null)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Tambah" : "Edit"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {fields.map((f) => (
            <div key={f.name} className="space-y-2">
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input
                id={f.name}
                name={f.name}
                type={f.type ?? "text"}
                defaultValue={(row?.[f.name] as string | number | undefined) ?? ""}
                placeholder={f.placeholder}
                required={f.required}
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="sort_order">Urutan</Label>
            <Input
              id="sort_order"
              name="sort_order"
              type="number"
              min={0}
              defaultValue={row?.sort_order ?? 0}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={row?.is_active ?? true}
            />
            Aktif
          </label>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function LookupCrud({
  title,
  description,
  rows,
  actions,
  extraFields = [],
  extraColumns = [],
}: {
  title: string
  description: string
  rows: LookupRow[]
  actions: LookupActions
  extraFields?: LookupField[]
  // Extra read-only columns shown in the table, e.g. [{ key: "province", label: "Provinsi" }]
  extraColumns?: { key: string; label: string }[]
}) {
  const fields = [...BASE_FIELDS, ...extraFields]
  const [pending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function onDelete(r: LookupRow) {
    if (!confirm(`Hapus "${r.name_id}"?`)) return
    setDeletingId(r.id)
    startTransition(async () => {
      const res = await actions.remove(r.id)
      if (res.ok === false) alert(res.error)
      setDeletingId(null)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
        <FormDialog
          mode="create"
          fields={fields}
          actions={actions}
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Tambah
            </Button>
          }
        />
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <List className="h-4 w-4" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-muted-foreground border-border flex h-48 items-center justify-center rounded-xl border-2 border-dashed text-sm">
              Belum ada data
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-left">
                    <th className="px-3 py-3 font-medium">Urutan</th>
                    <th className="px-3 py-3 font-medium">Slug</th>
                    <th className="px-3 py-3 font-medium">Nama (ID)</th>
                    <th className="px-3 py-3 font-medium">Nama (EN)</th>
                    {extraColumns.map((c) => (
                      <th key={c.key} className="px-3 py-3 font-medium">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-border/50 hover:bg-secondary/50 border-b transition-colors"
                    >
                      <td className="text-muted-foreground px-3 py-3">{r.sort_order}</td>
                      <td className="px-3 py-3 font-mono text-xs">{r.slug}</td>
                      <td className="px-3 py-3 font-medium">{r.name_id}</td>
                      <td className="text-muted-foreground px-3 py-3">{r.name_en}</td>
                      {extraColumns.map((c) => (
                        <td key={c.key} className="text-muted-foreground px-3 py-3">
                          {(r[c.key] as string) ?? "—"}
                        </td>
                      ))}
                      <td className="px-3 py-3">
                        <Badge variant={r.is_active ? "default" : "outline"}>
                          {r.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <FormDialog
                            mode="edit"
                            row={r}
                            fields={fields}
                            actions={actions}
                            trigger={
                              <Button variant="ghost" size="icon-sm" aria-label="Edit">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Hapus"
                            disabled={deletingId === r.id}
                            onClick={() => onDelete(r)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Create the `professions` page + actions (reference implementation)**

Create `apps/admin/src/app/dashboard/config/professions/actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { CreateProfessionSchema } from "@app/types"
import type { ActionResult } from "@/components/config/lookup-crud"

const PATH = "/dashboard/config/professions"
const TABLE = "professions"

function parse(formData: FormData) {
  return CreateProfessionSchema.safeParse({
    slug: String(formData.get("slug") ?? "").trim(),
    name_id: String(formData.get("name_id") ?? "").trim(),
    name_en: String(formData.get("name_en") ?? "").trim(),
    sort_order: Number(formData.get("sort_order") ?? 0),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  })
}

export async function create(formData: FormData): Promise<ActionResult> {
  const parsed = parse(formData)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid" }
  const supabase = await createClient()
  const { error } = await supabase.from(TABLE).insert(parsed.data)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

export async function update(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = parse(formData)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid" }
  const supabase = await createClient()
  const { error } = await supabase.from(TABLE).update(parsed.data).eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

export async function remove(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from(TABLE).delete().eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}
```

Create `apps/admin/src/app/dashboard/config/professions/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server"
import { LookupCrud, type LookupRow } from "@/components/config/lookup-crud"
import { create, update, remove } from "./actions"

export default async function ProfessionsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("professions")
    .select("*")
    .order("sort_order", { ascending: true })

  return (
    <LookupCrud
      title="Profesi"
      description="Kelola daftar profesi pengguna"
      rows={(data ?? []) as LookupRow[]}
      actions={{ create, update, remove }}
    />
  )
}
```

- [ ] **Step 3: Create `investor-types`, `business-models`, `partnership-models` pages + actions**

For each of `investor-types`, `business-models`, `partnership-models`, create `actions.ts` identical to the professions `actions.ts` from Step 2 but changing the three constants and the imported schema:

- `investor-types`: `PATH = "/dashboard/config/investor-types"`, `TABLE = "investor_types"`, import `CreateInvestorTypeSchema` (use it in `parse`).
- `business-models`: `PATH = "/dashboard/config/business-models"`, `TABLE = "business_models"`, import `CreateBusinessModelSchema`.
- `partnership-models`: `PATH = "/dashboard/config/partnership-models"`, `TABLE = "partnership_models"`, import `CreatePartnershipModelSchema`.

And `page.tsx` identical to professions' but changing `.from(...)`, `title`, `description`:

- `investor-types`: `.from("investor_types")`, title `"Tipe Investor"`, description `"Kelola tipe investor"`.
- `business-models`: `.from("business_models")`, title `"Model Bisnis"`, description `"Kelola model bisnis"`.
- `partnership-models`: `.from("partnership_models")`, title `"Model Kemitraan"`, description `"Kelola model kemitraan"`.

- [ ] **Step 4: Create the `cities` page + actions (extra fields)**

Create `apps/admin/src/app/dashboard/config/cities/actions.ts` — same as professions Step 2 but `PATH = "/dashboard/config/cities"`, `TABLE = "cities"`, import `CreateCitySchema`, and `parse` includes `code`/`province`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { CreateCitySchema } from "@app/types"
import type { ActionResult } from "@/components/config/lookup-crud"

const PATH = "/dashboard/config/cities"
const TABLE = "cities"

function parse(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim()
  return CreateCitySchema.safeParse({
    slug: String(formData.get("slug") ?? "").trim(),
    code: code === "" ? null : code,
    name_id: String(formData.get("name_id") ?? "").trim(),
    name_en: String(formData.get("name_en") ?? "").trim(),
    province: String(formData.get("province") ?? "").trim(),
    sort_order: Number(formData.get("sort_order") ?? 0),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  })
}

export async function create(formData: FormData): Promise<ActionResult> {
  const parsed = parse(formData)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid" }
  const supabase = await createClient()
  const { error } = await supabase.from(TABLE).insert(parsed.data)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

export async function update(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = parse(formData)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid" }
  const supabase = await createClient()
  const { error } = await supabase.from(TABLE).update(parsed.data).eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

export async function remove(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from(TABLE).delete().eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}
```

Create `apps/admin/src/app/dashboard/config/cities/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server"
import { LookupCrud, type LookupRow } from "@/components/config/lookup-crud"
import { create, update, remove } from "./actions"

export default async function CitiesPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("cities")
    .select("*")
    .order("sort_order", { ascending: true })

  return (
    <LookupCrud
      title="Kota"
      description="Kelola daftar kota"
      rows={(data ?? []) as LookupRow[]}
      actions={{ create, update, remove }}
      extraFields={[
        { name: "code", label: "Kode", placeholder: "JKT" },
        {
          name: "province",
          label: "Provinsi",
          placeholder: "DKI Jakarta",
          required: true,
        },
      ]}
      extraColumns={[{ key: "province", label: "Provinsi" }]}
    />
  )
}
```

- [ ] **Step 5: Add the five entries to the sidebar config group**

In `apps/admin/src/components/layout/sidebar-nav.tsx`, add imports `MapPin, Briefcase, UserCog, Boxes, Handshake` to the `lucide-react` import, and append to `configItems`:

```ts
  { href: "/dashboard/config/cities", label: "Kota", icon: MapPin },
  { href: "/dashboard/config/professions", label: "Profesi", icon: Briefcase },
  { href: "/dashboard/config/investor-types", label: "Tipe Investor", icon: UserCog },
  { href: "/dashboard/config/business-models", label: "Model Bisnis", icon: Boxes },
  { href: "/dashboard/config/partnership-models", label: "Model Kemitraan", icon: Handshake },
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Manual smoke**

Run `pnpm --filter @app/admin dev` (port 3001), log in as an admin. For each of the 5 new config pages: list shows seeded rows; add a row; edit it; delete it. Confirm the sidebar "Konfigurasi" group shows all entries and active-highlights correctly.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/src/components/config apps/admin/src/app/dashboard/config apps/admin/src/components/layout/sidebar-nav.tsx
git commit -m "feat(admin): config CRUD for cities, professions, investor/business/partnership lookups"
```

---

## Task 5: Admin user list page

**Files:**

- Create: `apps/admin/src/lib/lookups.ts`
- Create: `apps/admin/src/app/dashboard/users/page.tsx`
- Create: `apps/admin/src/app/dashboard/users/_components/user-filters.tsx`
- Create: `apps/admin/src/app/dashboard/users/_components/user-list-table.tsx`

**Interfaces:**

- Consumes: `profiles` (+ `city_id`), `cities` (Task 1/2).
- Produces: `getActiveLookups()` server helper returning `{ cities, professions, investorTypes, businessModels, partnershipModels }` (each `{ id, name_id }[]`); the `/dashboard/users` list with server-side filters by `q` (name/email/phone), `role`, `city_id`.

- [ ] **Step 1: Write the lookups helper**

Create `apps/admin/src/lib/lookups.ts`:

```ts
import { createClient } from "@/lib/supabase/server"

export type LookupOption = { id: string; name_id: string }

async function activeRows(table: string): Promise<LookupOption[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from(table)
    .select("id, name_id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
  return (data ?? []) as LookupOption[]
}

export async function getActiveLookups() {
  const [cities, professions, investorTypes, businessModels, partnershipModels] =
    await Promise.all([
      activeRows("cities"),
      activeRows("professions"),
      activeRows("investor_types"),
      activeRows("business_models"),
      activeRows("partnership_models"),
    ])
  return { cities, professions, investorTypes, businessModels, partnershipModels }
}
```

- [ ] **Step 2: Write the filters component**

Create `apps/admin/src/app/dashboard/users/_components/user-filters.tsx`:

```tsx
"use client"

import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { LookupOption } from "@/lib/lookups"

const ROLES = ["franchise_owner", "investor", "landlord", "worker", "admin"]

export function UserFilters({
  q,
  role,
  cityId,
  cities,
}: {
  q: string
  role: string
  cityId: string
  cities: LookupOption[]
}) {
  const router = useRouter()

  function apply(form: FormData) {
    const params = new URLSearchParams()
    const next = {
      q: String(form.get("q") ?? "").trim(),
      role: String(form.get("role") ?? ""),
      city: String(form.get("city") ?? ""),
    }
    if (next.q) params.set("q", next.q)
    if (next.role) params.set("role", next.role)
    if (next.city) params.set("city", next.city)
    router.push(`/dashboard/users${params.toString() ? `?${params}` : ""}`)
  }

  return (
    <form action={apply} className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1">
        <Input name="q" defaultValue={q} placeholder="Cari nama, email, atau HP" />
      </div>
      <select
        name="role"
        defaultValue={role}
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      >
        <option value="">Semua role</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <select
        name="city"
        defaultValue={cityId}
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      >
        <option value="">Semua kota</option>
        {cities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name_id}
          </option>
        ))}
      </select>
      <Button type="submit">Filter</Button>
    </form>
  )
}
```

- [ ] **Step 3: Write the list table**

Create `apps/admin/src/app/dashboard/users/_components/user-list-table.tsx`:

```tsx
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export type UserRow = {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: string
  created_at: string
  cities: { name_id: string } | null
}

export function UserListTable({ users }: { users: UserRow[] }) {
  if (users.length === 0) {
    return (
      <div className="text-muted-foreground border-border flex h-48 items-center justify-center rounded-xl border-2 border-dashed text-sm">
        Tidak ada pengguna
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-left">
            <th className="px-3 py-3 font-medium">Nama</th>
            <th className="px-3 py-3 font-medium">Email</th>
            <th className="px-3 py-3 font-medium">HP</th>
            <th className="px-3 py-3 font-medium">Role</th>
            <th className="px-3 py-3 font-medium">Kota</th>
            <th className="px-3 py-3 font-medium">Daftar</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr
              key={u.id}
              className="border-border/50 hover:bg-secondary/50 border-b transition-colors"
            >
              <td className="px-3 py-3 font-medium">
                <Link href={`/dashboard/users/${u.id}`} className="hover:underline">
                  {u.full_name || "—"}
                </Link>
              </td>
              <td className="text-muted-foreground px-3 py-3">{u.email}</td>
              <td className="text-muted-foreground px-3 py-3">{u.phone ?? "—"}</td>
              <td className="px-3 py-3">
                <Badge variant="outline">{u.role}</Badge>
              </td>
              <td className="text-muted-foreground px-3 py-3">
                {u.cities?.name_id ?? "—"}
              </td>
              <td className="text-muted-foreground px-3 py-3">
                {new Date(u.created_at).toLocaleDateString("id-ID")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Write the page with server-side filters**

Create `apps/admin/src/app/dashboard/users/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users } from "lucide-react"
import { getActiveLookups } from "@/lib/lookups"
import { UserFilters } from "./_components/user-filters"
import { UserListTable, type UserRow } from "./_components/user-list-table"

type SearchParams = { q?: string; role?: string; city?: string }

// PostgREST `.or()` uses commas and parens as syntax; strip them from user input.
function sanitize(value: string) {
  return value.replace(/[,()*]/g, " ").trim()
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const q = sp.q?.trim() ?? ""
  const role = sp.role ?? ""
  const city = sp.city ?? ""

  const supabase = await createClient()
  let query = supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, created_at, cities ( name_id )")
    .order("created_at", { ascending: false })

  const search = sanitize(q)
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }
  if (role) query = query.eq("role", role)
  if (city) query = query.eq("city_id", city)

  const { data, error } = await query
  const users = (data ?? []) as unknown as UserRow[]
  const { cities } = await getActiveLookups()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Pengguna</h1>
        <p className="text-muted-foreground mt-1">Daftar pengguna dengan filter</p>
      </div>

      <Card className="glass">
        <CardHeader className="space-y-4">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Semua Pengguna
          </CardTitle>
          <UserFilters q={q} role={role} cityId={city} cities={cities} />
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-destructive text-sm">
              Gagal memuat data: {error.message}
            </div>
          ) : (
            <UserListTable users={users} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (Note: the `cities ( name_id )` embed requires the `profiles.city_id` FK from Task 2 to exist — confirm migration 011 ran.)

- [ ] **Step 6: Manual smoke**

In admin dev (port 3001), open `/dashboard/users`: list renders; type a name/email in search and Filter narrows results; role and city dropdowns filter; clicking a name navigates to `/dashboard/users/[id]` (404 until Task 6 — expected).

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib/lookups.ts apps/admin/src/app/dashboard/users
git commit -m "feat(admin): user list page with server-side filters"
```

---

## Task 6: Admin user detail page

**Files:**

- Create: `apps/admin/src/app/dashboard/users/[id]/page.tsx`
- Create: `apps/admin/src/app/dashboard/users/[id]/actions.ts`
- Create: `apps/admin/src/app/dashboard/users/[id]/_components/account-section.tsx`
- Create: `apps/admin/src/app/dashboard/users/[id]/_components/personal-section.tsx`
- Create: `apps/admin/src/app/dashboard/users/[id]/_components/preference-section.tsx`
- Create: `apps/admin/src/app/dashboard/users/[id]/_components/interest-section.tsx`

**Interfaces:**

- Consumes: `getActiveLookups()` (Task 5), `GenderLabels`, `EducationLabels` (Task 3), `merchant_categories`, `user_preferences`, `user_preference_categories`.
- Produces: 4 server actions — `updateAccount(id, FormData)`, `updatePersonal(id, FormData)`, `updatePreference(id, FormData)` (upsert), `updateInterests(id, ids: string[])` (diff) — each returning `ActionResult`.

- [ ] **Step 1: Write the server actions**

Create `apps/admin/src/app/dashboard/users/[id]/actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { ok: true } | { ok: false; error: string }

function path(id: string) {
  return `/dashboard/users/${id}`
}

function nullable(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim()
  return s === "" ? null : s
}

function nullableInt(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim()
  return s === "" ? null : Number(s)
}

export async function updateAccount(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: String(formData.get("full_name") ?? "").trim(),
      phone: nullable(formData.get("phone")),
      username: nullable(formData.get("username")),
      role: String(formData.get("role") ?? "").trim(),
      subscribe_newsletter: formData.get("subscribe_newsletter") === "on",
    })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(path(id))
  return { ok: true }
}

export async function updatePersonal(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("profiles")
    .update({
      birth_date: nullable(formData.get("birth_date")),
      birth_place: nullable(formData.get("birth_place")),
      gender: nullable(formData.get("gender")),
      education: nullable(formData.get("education")),
      profession_id: nullable(formData.get("profession_id")),
      investor_type_id: nullable(formData.get("investor_type_id")),
      city_id: nullable(formData.get("city_id")),
    })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(path(id))
  return { ok: true }
}

export async function updatePreference(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: id,
      budget_min: nullableInt(formData.get("budget_min")),
      budget_max: nullableInt(formData.get("budget_max")),
      preferred_city_id: nullable(formData.get("preferred_city_id")),
      business_model_id: nullable(formData.get("business_model_id")),
      partnership_model_id: nullable(formData.get("partnership_model_id")),
      target_roi: nullableInt(formData.get("target_roi")),
    },
    { onConflict: "user_id" }
  )
  if (error) return { ok: false, error: error.message }
  revalidatePath(path(id))
  return { ok: true }
}

export async function updateInterests(
  id: string,
  categoryIds: string[]
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: existing, error: readErr } = await supabase
    .from("user_preference_categories")
    .select("merchant_category_id")
    .eq("user_id", id)
  if (readErr) return { ok: false, error: readErr.message }

  const current = new Set((existing ?? []).map((r) => r.merchant_category_id as string))
  const next = new Set(categoryIds)
  const toAdd = [...next].filter((c) => !current.has(c))
  const toRemove = [...current].filter((c) => !next.has(c))

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("user_preference_categories")
      .insert(toAdd.map((cid) => ({ user_id: id, merchant_category_id: cid })))
    if (error) return { ok: false, error: error.message }
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("user_preference_categories")
      .delete()
      .eq("user_id", id)
      .in("merchant_category_id", toRemove)
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath(path(id))
  return { ok: true }
}
```

- [ ] **Step 2: Write the Account section**

Create `apps/admin/src/app/dashboard/users/[id]/_components/account-section.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateAccount, type ActionResult } from "../actions"

const ROLES = ["franchise_owner", "investor", "landlord", "worker", "admin"]

export type Account = {
  id: string
  full_name: string
  email: string
  phone: string | null
  username: string | null
  role: string
  subscribe_newsletter: boolean
  gamification_point: number
  total_token: number
}

export function AccountSection({ account }: { account: Account }) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res: ActionResult = await updateAccount(account.id, formData)
      if (res.ok === false) setError(res.error)
      else setSaved(true)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="full_name">Nama Lengkap</Label>
          <Input
            id="full_name"
            name="full_name"
            defaultValue={account.full_name}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={account.email} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">No. HP</Label>
          <Input id="phone" name="phone" defaultValue={account.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" name="username" defaultValue={account.username ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            name="role"
            defaultValue={account.role}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-muted-foreground grid gap-4 text-sm sm:grid-cols-2">
        <div>Poin gamifikasi: {account.gamification_point}</div>
        <div>Total token: {account.total_token}</div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="subscribe_newsletter"
          defaultChecked={account.subscribe_newsletter}
        />
        Berlangganan newsletter
      </label>

      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="border-border flex items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan Perubahan"}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Tersimpan</span>}
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Write the Personal section**

Create `apps/admin/src/app/dashboard/users/[id]/_components/personal-section.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GenderLabels, EducationLabels } from "@app/types"
import type { LookupOption } from "@/lib/lookups"
import { updatePersonal, type ActionResult } from "../actions"

export type Personal = {
  id: string
  birth_date: string | null
  birth_place: string | null
  gender: string | null
  education: string | null
  profession_id: string | null
  investor_type_id: string | null
  city_id: string | null
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string
  label: string
  value: string | null
  options: { id: string; name_id: string }[]
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={value ?? ""}
        className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
      >
        <option value="">— Pilih —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name_id}
          </option>
        ))}
      </select>
    </div>
  )
}

export function PersonalSection({
  personal,
  cities,
  professions,
  investorTypes,
}: {
  personal: Personal
  cities: LookupOption[]
  professions: LookupOption[]
  investorTypes: LookupOption[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res: ActionResult = await updatePersonal(personal.id, formData)
      if (res.ok === false) setError(res.error)
      else setSaved(true)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="birth_date">Tanggal Lahir</Label>
          <Input
            id="birth_date"
            name="birth_date"
            type="date"
            defaultValue={personal.birth_date ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="birth_place">Tempat Lahir</Label>
          <Input
            id="birth_place"
            name="birth_place"
            defaultValue={personal.birth_place ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gender">Jenis Kelamin</Label>
          <select
            id="gender"
            name="gender"
            defaultValue={personal.gender ?? ""}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">— Pilih —</option>
            {Object.entries(GenderLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v.id}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="education">Pendidikan</Label>
          <select
            id="education"
            name="education"
            defaultValue={personal.education ?? ""}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">— Pilih —</option>
            {Object.entries(EducationLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v.id}
              </option>
            ))}
          </select>
        </div>
        <Select
          name="profession_id"
          label="Profesi"
          value={personal.profession_id}
          options={professions}
        />
        <Select
          name="investor_type_id"
          label="Tipe Investor"
          value={personal.investor_type_id}
          options={investorTypes}
        />
        <Select
          name="city_id"
          label="Kota Domisili"
          value={personal.city_id}
          options={cities}
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="border-border flex items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan Perubahan"}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Tersimpan</span>}
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Write the Preference section**

Create `apps/admin/src/app/dashboard/users/[id]/_components/preference-section.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { LookupOption } from "@/lib/lookups"
import { updatePreference, type ActionResult } from "../actions"

export type Preference = {
  budget_min: number | null
  budget_max: number | null
  preferred_city_id: string | null
  business_model_id: string | null
  partnership_model_id: string | null
  target_roi: number | null
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string
  label: string
  value: string | null
  options: LookupOption[]
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={value ?? ""}
        className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
      >
        <option value="">— Pilih —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name_id}
          </option>
        ))}
      </select>
    </div>
  )
}

export function PreferenceSection({
  userId,
  preference,
  cities,
  businessModels,
  partnershipModels,
}: {
  userId: string
  preference: Preference
  cities: LookupOption[]
  businessModels: LookupOption[]
  partnershipModels: LookupOption[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res: ActionResult = await updatePreference(userId, formData)
      if (res.ok === false) setError(res.error)
      else setSaved(true)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="budget_min">Budget Min (Rp)</Label>
          <Input
            id="budget_min"
            name="budget_min"
            type="number"
            min={0}
            defaultValue={preference.budget_min ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="budget_max">Budget Max (Rp)</Label>
          <Input
            id="budget_max"
            name="budget_max"
            type="number"
            min={0}
            defaultValue={preference.budget_max ?? ""}
          />
        </div>
        <Select
          name="preferred_city_id"
          label="Kota Target"
          value={preference.preferred_city_id}
          options={cities}
        />
        <div className="space-y-2">
          <Label htmlFor="target_roi">Target ROI (%)</Label>
          <Input
            id="target_roi"
            name="target_roi"
            type="number"
            min={0}
            defaultValue={preference.target_roi ?? ""}
          />
        </div>
        <Select
          name="business_model_id"
          label="Model Bisnis"
          value={preference.business_model_id}
          options={businessModels}
        />
        <Select
          name="partnership_model_id"
          label="Model Kemitraan"
          value={preference.partnership_model_id}
          options={partnershipModels}
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="border-border flex items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan Perubahan"}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Tersimpan</span>}
      </div>
    </form>
  )
}
```

- [ ] **Step 5: Write the Interest (categories) section**

Create `apps/admin/src/app/dashboard/users/[id]/_components/interest-section.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { updateInterests, type ActionResult } from "../actions"

export type CategoryOption = { id: string; name_id: string }

export function InterestSection({
  userId,
  categories,
  selectedIds,
}: {
  userId: string
  categories: CategoryOption[]
  selectedIds: string[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res: ActionResult = await updateInterests(userId, [...selected])
      if (res.ok === false) setError(res.error)
      else setSaved(true)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const on = selected.has(c.id)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              aria-pressed={on}
            >
              <Badge variant={on ? "default" : "outline"} className="cursor-pointer">
                {c.name_id}
              </Badge>
            </button>
          )
        })}
        {categories.length === 0 && (
          <p className="text-muted-foreground text-sm">Belum ada kategori merchant.</p>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="border-border flex items-center gap-3 border-t pt-4">
        <Button type="button" onClick={onSave} disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan Perubahan"}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Tersimpan</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Write the detail page (loads data + tabs)**

Create `apps/admin/src/app/dashboard/users/[id]/page.tsx`:

```tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getActiveLookups } from "@/lib/lookups"
import { AccountSection, type Account } from "./_components/account-section"
import { PersonalSection, type Personal } from "./_components/personal-section"
import { PreferenceSection, type Preference } from "./_components/preference-section"
import { InterestSection } from "./_components/interest-section"

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single()
  if (!profile) notFound()

  const { data: pref } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", id)
    .maybeSingle()

  const { data: catRows } = await supabase
    .from("user_preference_categories")
    .select("merchant_category_id")
    .eq("user_id", id)
  const selectedIds = (catRows ?? []).map((r) => r.merchant_category_id as string)

  const { data: categories } = await supabase
    .from("merchant_categories")
    .select("id, name_id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })

  const lookups = await getActiveLookups()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/users">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali ke daftar pengguna
          </Button>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold">
            {profile.full_name || profile.email}
          </h1>
          <Badge variant="outline">{profile.role}</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">{profile.email}</p>
      </div>

      <Card className="glass">
        <CardContent className="pt-6">
          <Tabs defaultValue="account">
            <TabsList className="flex-wrap">
              <TabsTrigger value="account">Akun</TabsTrigger>
              <TabsTrigger value="personal">Data Diri</TabsTrigger>
              <TabsTrigger value="preference">Preferensi</TabsTrigger>
              <TabsTrigger value="interest">
                Kategori Minat ({selectedIds.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="account">
              <AccountSection
                account={
                  {
                    id: profile.id,
                    full_name: profile.full_name,
                    email: profile.email,
                    phone: profile.phone ?? null,
                    username: profile.username ?? null,
                    role: profile.role,
                    subscribe_newsletter: profile.subscribe_newsletter ?? false,
                    gamification_point: profile.gamification_point ?? 0,
                    total_token: profile.total_token ?? 0,
                  } satisfies Account
                }
              />
            </TabsContent>

            <TabsContent value="personal">
              <PersonalSection
                personal={
                  {
                    id: profile.id,
                    birth_date: profile.birth_date ?? null,
                    birth_place: profile.birth_place ?? null,
                    gender: profile.gender ?? null,
                    education: profile.education ?? null,
                    profession_id: profile.profession_id ?? null,
                    investor_type_id: profile.investor_type_id ?? null,
                    city_id: profile.city_id ?? null,
                  } satisfies Personal
                }
                cities={lookups.cities}
                professions={lookups.professions}
                investorTypes={lookups.investorTypes}
              />
            </TabsContent>

            <TabsContent value="preference">
              <PreferenceSection
                userId={profile.id}
                preference={
                  {
                    budget_min: pref?.budget_min ?? null,
                    budget_max: pref?.budget_max ?? null,
                    preferred_city_id: pref?.preferred_city_id ?? null,
                    business_model_id: pref?.business_model_id ?? null,
                    partnership_model_id: pref?.partnership_model_id ?? null,
                    target_roi: pref?.target_roi ?? null,
                  } satisfies Preference
                }
                cities={lookups.cities}
                businessModels={lookups.businessModels}
                partnershipModels={lookups.partnershipModels}
              />
            </TabsContent>

            <TabsContent value="interest">
              <InterestSection
                userId={profile.id}
                categories={(categories ?? []) as { id: string; name_id: string }[]}
                selectedIds={selectedIds}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Manual smoke**

In admin dev (port 3001), open a user from the list. For each tab: edit a field and Save → "Tersimpan" appears; reload the page and confirm the value persisted. Specifically verify: Preferensi save creates a `user_preferences` row (first save) then updates it (second save); Kategori Minat toggling badges + Save adds/removes `user_preference_categories` rows (count in the tab label updates after reload).

- [ ] **Step 9: Commit**

```bash
git add apps/admin/src/app/dashboard/users/[id]
git commit -m "feat(admin): user detail page — account, personal, preferences, interests"
```

---

## Task 7: Expanded web dashboard profile form

**Files:**

- Modify: `apps/web/src/app/dashboard/profile/page.tsx`
- Modify: `apps/web/src/app/dashboard/profile/_components/profile-form.tsx`

**Interfaces:**

- Consumes: `profiles`, `user_preferences`, `user_preference_categories`, lookup tables, `GenderLabels`/`EducationLabels` (Task 3).
- Produces: a self-service profile + preferences + interests form for the logged-in user (writes via the browser Supabase client under owner RLS).

- [ ] **Step 1: Inspect the current page loader**

Read `apps/web/src/app/dashboard/profile/page.tsx` to see how it currently fetches the profile and renders `<ProfileForm initialData={...} />`. Keep its auth/redirect logic; extend the data it loads.

- [ ] **Step 2: Extend the page loader to fetch lookups + preferences**

In `apps/web/src/app/dashboard/profile/page.tsx`, after the existing profile fetch, add (using the existing `await createClient()` server client variable — match the file's current variable name):

```tsx
const [{ data: pref }, { data: catRows }, ...lookups] = await Promise.all([
  supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
  supabase
    .from("user_preference_categories")
    .select("merchant_category_id")
    .eq("user_id", user.id),
  supabase.from("cities").select("id, name_id").eq("is_active", true).order("sort_order"),
  supabase
    .from("professions")
    .select("id, name_id")
    .eq("is_active", true)
    .order("sort_order"),
  supabase
    .from("investor_types")
    .select("id, name_id")
    .eq("is_active", true)
    .order("sort_order"),
  supabase
    .from("business_models")
    .select("id, name_id")
    .eq("is_active", true)
    .order("sort_order"),
  supabase
    .from("partnership_models")
    .select("id, name_id")
    .eq("is_active", true)
    .order("sort_order"),
  supabase
    .from("merchant_categories")
    .select("id, name_id")
    .eq("is_active", true)
    .order("sort_order"),
])
const [
  cities,
  professions,
  investorTypes,
  businessModels,
  partnershipModels,
  categories,
] = lookups.map((r) => (r.data ?? []) as { id: string; name_id: string }[])
const selectedCategoryIds = (catRows ?? []).map((r) => r.merchant_category_id as string)
```

Then pass the extra props to the form:

```tsx
<ProfileForm
  initialData={profile}
  preference={pref ?? null}
  selectedCategoryIds={selectedCategoryIds}
  lookups={{
    cities,
    professions,
    investorTypes,
    businessModels,
    partnershipModels,
    categories,
  }}
/>
```

(Adjust `user.id` / `profile` to the variable names already used in the file. The first array element after `Promise.all` is `pref`; the destructure above handles ordering.)

- [ ] **Step 3: Rewrite the profile form (data diri + preferensi + kategori)**

Replace `apps/web/src/app/dashboard/profile/_components/profile-form.tsx` with the expanded version. It keeps the existing react-hook-form + browser-client save pattern for the profile fields, adds preference upsert and category diff, and swaps the free-text `city` input for a `city_id` dropdown:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { GenderLabels, EducationLabels, type Profile } from "@app/types"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"

type Option = { id: string; name_id: string }
type Lookups = {
  cities: Option[]
  professions: Option[]
  investorTypes: Option[]
  businessModels: Option[]
  partnershipModels: Option[]
  categories: Option[]
}
type Preference = {
  budget_min: number | null
  budget_max: number | null
  preferred_city_id: string | null
  business_model_id: string | null
  partnership_model_id: string | null
  target_roi: number | null
} | null

function num(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim()
  return s === "" ? null : Number(s)
}
function str(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim()
  return s === "" ? null : s
}

function SelectField({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string
  label: string
  defaultValue: string | null
  options: Option[]
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
      >
        <option value="">— Pilih —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name_id}
          </option>
        ))}
      </select>
    </div>
  )
}

export function ProfileForm({
  initialData,
  preference,
  selectedCategoryIds,
  lookups,
}: {
  initialData: Profile
  preference: Preference
  selectedCategoryIds: string[]
  lookups: Lookups
}) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedCats, setSelectedCats] = useState<Set<string>>(
    new Set(selectedCategoryIds)
  )

  function toggleCat(id: string) {
    setSelectedCats((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setServerError(null)
    setSuccess(false)
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const supabase = createClient()
    const uid = initialData.id

    try {
      // 1. profile fields
      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          full_name: String(fd.get("full_name") ?? "").trim(),
          phone: str(fd.get("phone")),
          birth_date: str(fd.get("birth_date")),
          birth_place: str(fd.get("birth_place")),
          gender: str(fd.get("gender")),
          education: str(fd.get("education")),
          profession_id: str(fd.get("profession_id")),
          investor_type_id: str(fd.get("investor_type_id")),
          city_id: str(fd.get("city_id")),
          subscribe_newsletter: fd.get("subscribe_newsletter") === "on",
        })
        .eq("id", uid)
      if (pErr) throw pErr

      // 2. preferences upsert
      const { error: prefErr } = await supabase.from("user_preferences").upsert(
        {
          user_id: uid,
          budget_min: num(fd.get("budget_min")),
          budget_max: num(fd.get("budget_max")),
          preferred_city_id: str(fd.get("preferred_city_id")),
          business_model_id: str(fd.get("business_model_id")),
          partnership_model_id: str(fd.get("partnership_model_id")),
          target_roi: num(fd.get("target_roi")),
        },
        { onConflict: "user_id" }
      )
      if (prefErr) throw prefErr

      // 3. interest categories diff
      const current = new Set(selectedCategoryIds)
      const next = selectedCats
      const toAdd = [...next].filter((c) => !current.has(c))
      const toRemove = [...current].filter((c) => !next.has(c))
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("user_preference_categories")
          .insert(toAdd.map((cid) => ({ user_id: uid, merchant_category_id: cid })))
        if (error) throw error
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("user_preference_categories")
          .delete()
          .eq("user_id", uid)
          .in("merchant_category_id", toRemove)
        if (error) throw error
      }

      setSuccess(true)
      router.refresh()
    } catch (err: unknown) {
      setServerError(
        err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {serverError && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {serverError}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-500">
          Profil berhasil diperbarui.
        </div>
      )}

      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">Data Diri</h2>
        <div className="space-y-2">
          <Label htmlFor="full_name">Nama Lengkap *</Label>
          <Input
            id="full_name"
            name="full_name"
            defaultValue={initialData.full_name ?? ""}
            required
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Nomor Telepon</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={initialData.phone ?? ""}
              placeholder="0812..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="birth_date">Tanggal Lahir</Label>
            <Input
              id="birth_date"
              name="birth_date"
              type="date"
              defaultValue={initialData.birth_date ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="birth_place">Tempat Lahir</Label>
            <Input
              id="birth_place"
              name="birth_place"
              defaultValue={initialData.birth_place ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gender">Jenis Kelamin</Label>
            <select
              id="gender"
              name="gender"
              defaultValue={initialData.gender ?? ""}
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value="">— Pilih —</option>
              {Object.entries(GenderLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.id}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="education">Pendidikan Terakhir</Label>
            <select
              id="education"
              name="education"
              defaultValue={initialData.education ?? ""}
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value="">— Pilih —</option>
              {Object.entries(EducationLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.id}
                </option>
              ))}
            </select>
          </div>
          <SelectField
            name="profession_id"
            label="Profesi"
            defaultValue={initialData.profession_id}
            options={lookups.professions}
          />
          <SelectField
            name="investor_type_id"
            label="Tipe Investor"
            defaultValue={initialData.investor_type_id}
            options={lookups.investorTypes}
          />
          <SelectField
            name="city_id"
            label="Kota Domisili"
            defaultValue={initialData.city_id}
            options={lookups.cities}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="subscribe_newsletter"
            defaultChecked={initialData.subscribe_newsletter ?? false}
          />
          Berlangganan newsletter
        </label>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">Preferensi Investasi</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="budget_min">Budget Min (Rp)</Label>
            <Input
              id="budget_min"
              name="budget_min"
              type="number"
              min={0}
              defaultValue={preference?.budget_min ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget_max">Budget Max (Rp)</Label>
            <Input
              id="budget_max"
              name="budget_max"
              type="number"
              min={0}
              defaultValue={preference?.budget_max ?? ""}
            />
          </div>
          <SelectField
            name="preferred_city_id"
            label="Kota Target"
            defaultValue={preference?.preferred_city_id ?? null}
            options={lookups.cities}
          />
          <div className="space-y-2">
            <Label htmlFor="target_roi">Target ROI (%)</Label>
            <Input
              id="target_roi"
              name="target_roi"
              type="number"
              min={0}
              defaultValue={preference?.target_roi ?? ""}
            />
          </div>
          <SelectField
            name="business_model_id"
            label="Model Bisnis"
            defaultValue={preference?.business_model_id ?? null}
            options={lookups.businessModels}
          />
          <SelectField
            name="partnership_model_id"
            label="Model Kemitraan"
            defaultValue={preference?.partnership_model_id ?? null}
            options={lookups.partnershipModels}
          />
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">Kategori Minat</h2>
        <div className="flex flex-wrap gap-2">
          {lookups.categories.map((c) => {
            const on = selectedCats.has(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCat(c.id)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-muted-foreground"
                }`}
              >
                {c.name_id}
              </button>
            )
          })}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="gold" type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menyimpan...
            </>
          ) : (
            "Simpan Profil"
          )}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck` then `pnpm lint`
Expected: both PASS. (`initialData.birth_date` etc. now exist on `Profile` from Task 3.)

- [ ] **Step 5: Manual smoke**

Run `pnpm --filter @app/web dev` (port 3000), log in as a normal user, open `/dashboard/profile`. Fill Data Diri (incl. city dropdown), Preferensi, and toggle Kategori Minat; Save → success banner. Reload: all values persist. In Supabase, confirm a `user_preferences` row exists for the user and `user_preference_categories` reflects the toggles. Confirm a second user cannot read the first user's preferences (owner RLS).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/profile
git commit -m "feat(web): expanded dashboard profile — data diri, preferensi, kategori minat"
```

---

## Self-Review notes (addressed)

- **Spec coverage:** enums/lookups → Task 1; profile + user tables + RLS → Task 2; all types incl. gender/education label maps → Task 3; 5 lookup CRUD + sidebar → Task 4; user list w/ filters → Task 5; user detail 4 sections incl. preference upsert + category diff → Task 6; web profile form → Task 7. The spec's "two cities" (domicile `city_id` vs `preferred_city_id`) appears in Tasks 2/6/7.
- **Type consistency:** `ActionResult` is defined once in `lookup-crud.tsx` (Task 4) and re-imported by lookup actions; the user-detail actions (Task 6) define their own local `ActionResult` (same shape) to avoid cross-importing a client component into server code. Lookup action exports are named `create`/`update`/`remove` consistently across page + component (`actions={{ create, update, remove }}`). `LookupOption = { id; name_id }` is the single dropdown shape used by Tasks 5–7.
- **Deferred/again-confirm:** Task 7 Step 2 instructs matching the page's existing variable names (the loader's current shape wasn't captured verbatim) — the implementer reads the file first (Step 1) before editing.
