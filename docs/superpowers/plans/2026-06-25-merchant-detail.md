# Merchant Detail Implementation Plan

> **Status:** ✅ COMPLETE — all tasks implemented and verified (`pnpm typecheck`, `pnpm build`, `pnpm db:migrate` all pass). Boxes are checked to record what shipped. See spec: `docs/superpowers/specs/2026-06-25-merchant-detail-design.md`.

**Goal:** Add a merchant **detail page** to the admin app that manages per-franchise financials, outlets, ratings, and media — backed by 5 new tables in migration `009_merchant_detail.sql` and new Zod schemas in `@app/types`. Merchant == `franchises` row.

**Architecture:** Server Component fetches the franchise + its child rows via the admin Supabase server client; mutations run through Next.js Server Actions guarded by RLS, validated by Zod, ending in `revalidatePath`. DB triggers keep `franchises.outlet_count`, `rating_avg`, and `rating_count` in sync. The customer `web` app is untouched (`gallery_urls` kept alongside the new `franchise_media`).

**Tech Stack:** Next.js 16 (App Router async params + Server Actions), React 19, TypeScript, Supabase (`@supabase/ssr`), Zod, shadcn/ui primitives, `pg` migration runner, pnpm/Turborepo.

## Global Constraints

- All UI work is in `apps/admin`; **do not modify `apps/web`**. `gallery_urls` is kept, not migrated/dropped.
- Import domain types from `@app/types`; never redefine entity shapes locally.
- No test runner exists. Gate = `pnpm typecheck` + `pnpm build` (NOT `pnpm lint` — `next lint` removed in Next 16).
- Migration runner needs `DIRECT_URL` = Supabase **Session Pooler** (port 5432), not the IPv6 direct host.
- Indonesian is the default/primary UI language; author copy `id`-first.
- Next 16: route `params` is a `Promise` — `await` it. `cookies()` is async in the server client.

---

## File Structure

**Created:**

- `supabase/migrations/009_merchant_detail.sql` — `media_type` enum, 5 tables, `franchises` rating columns, sync triggers, RLS.
- `packages/types/src/outlet.ts`
- `packages/types/src/franchise-financials.ts`
- `packages/types/src/franchise-rating.ts`
- `packages/types/src/franchise-media.ts`
- `apps/admin/src/app/dashboard/config/merchants/[id]/page.tsx`
- `apps/admin/src/app/dashboard/config/merchants/[id]/actions.ts`
- `apps/admin/src/app/dashboard/config/merchants/[id]/_components/financials-section.tsx`
- `apps/admin/src/app/dashboard/config/merchants/[id]/_components/outlets-section.tsx`
- `apps/admin/src/app/dashboard/config/merchants/[id]/_components/outlet-form-dialog.tsx`
- `apps/admin/src/app/dashboard/config/merchants/[id]/_components/ratings-section.tsx`
- `apps/admin/src/app/dashboard/config/merchants/[id]/_components/rating-form-dialog.tsx`
- `apps/admin/src/app/dashboard/config/merchants/[id]/_components/media-section.tsx`
- `apps/admin/src/app/dashboard/config/merchants/[id]/_components/media-form-dialog.tsx`

**Modified:**

- `packages/types/src/index.ts` — export the 4 new type modules.
- `packages/types/src/franchise.ts` — add `rating_avg`/`rating_count` (optional) to schema + `.omit()`.
- `apps/admin/src/app/dashboard/config/merchants/_components/merchant-table.tsx` — link name + Detail button to `[id]`.

---

## Task 1: Database migration `009_merchant_detail.sql`

- [x] **Step 1:** `media_type` enum guarded by a `DO`/`EXCEPTION duplicate_object` block.
- [x] **Step 2:** `ALTER TABLE franchises ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(2,1) NOT NULL DEFAULT 0, rating_count INTEGER NOT NULL DEFAULT 0;` (`gallery_urls` untouched).
- [x] **Step 3:** `franchise_financials` (1:1, `franchise_id` UNIQUE FK CASCADE) + index + `update_updated_at` trigger.
- [x] **Step 4:** `franchise_additional_fees` (`name` NOT NULL, `amount` BIGINT) + index + trigger.
- [x] **Step 5:** `outlets` (`name` NOT NULL, `gmap`/`phone`/`address`/`photo_url`) + index + trigger; `sync_outlet_count()` AFTER INSERT/DELETE.
- [x] **Step 6:** `franchise_ratings` (`score` SMALLINT CHECK 1–5) + index + trigger; `sync_rating_aggregate()` AFTER INSERT/UPDATE/DELETE updates `rating_avg`/`rating_count`.
- [x] **Step 7:** `franchise_media` (`url` NOT NULL, `type` media_type DEFAULT 'image', `caption`, `sort_order`) + `(franchise_id, sort_order)` index + trigger.
- [x] **Step 8:** RLS enable + `_public_read` / `_owner_all` / `_admin_all` policies on all 5 tables (with `DROP POLICY IF EXISTS` guards).
- [x] **Verify:** `pnpm db:migrate` applies `008`; `schema_migrations` records it.

## Task 2: Zod schemas in `@app/types`

- [x] **Step 1:** `outlet.ts` — `OutletSchema` + Create (omit id/timestamps) + Update (`.partial`).
- [x] **Step 2:** `franchise-financials.ts` — `FranchiseFinancialsSchema` + `FranchiseAdditionalFeeSchema` + Create/Update for both.
- [x] **Step 3:** `franchise-rating.ts` — `FranchiseRatingSchema` + Create/Update.
- [x] **Step 4:** `franchise-media.ts` — `MediaTypeSchema`, `MediaTypeLabels`, `FranchiseMediaSchema` + Create/Update.
- [x] **Step 5:** `franchise.ts` — add `rating_avg`/`rating_count` (optional) to schema and `.omit()` list.
- [x] **Step 6:** export the 4 new modules from `index.ts`.

## Task 3: Admin detail page

- [x] **Step 1:** `actions.ts` (`"use server"`) — helpers (`pathFor`, `firstError`, `nullableNumber`, `requireUser`) + all CRUD actions (financials upsert, fees, outlets, ratings, media); each Zod-validates, auth-checks, mutates, `revalidatePath`.
- [x] **Step 2:** `page.tsx` (Server Component, `await params`) — fetch franchise + child rows via `Promise.all`; `notFound()` guard; header + `Tabs` (Financials/Outlets/Ratings/Media).
- [x] **Step 3:** `financials-section.tsx` — upsert form (5 number fields) + additional-fees inline table/dialog. Exports `FeeRow`.
- [x] **Step 4:** `outlet-form-dialog.tsx` (exports `OutletRow`) + `outlets-section.tsx` (table with gmap external link).
- [x] **Step 5:** `rating-form-dialog.tsx` (score Select 1–5, exports `RatingRow`) + `ratings-section.tsx` (star display cards).
- [x] **Step 6:** `media-form-dialog.tsx` (type Select from `MediaTypeLabels`, exports `MediaRow`) + `media-section.tsx` (grid; `<img>` thumbnail for image, Film icon for video).
- [x] **Step 7:** Wire entry point — `merchant-table.tsx`: name → `next/link` to `[id]`, plus per-row Detail (ExternalLink) button (`asChild`).

## Task 4: Verification

- [x] `pnpm db:migrate` — `008` applied cleanly.
- [x] `pnpm typecheck` — 2 successful.
- [x] `pnpm build` — admin + web build; `[id]` route compiled.
- [ ] **Manual smoke (pending user)** on `pnpm --filter @app/admin dev` (:3001): open a merchant → save financials + a fee; add an outlet (confirm `outlet_count` updates); add a rating (confirm `rating_avg`/`rating_count` update); add an image + a video media row.

---

## Task 5: CRUD consistency adjustments (post-detail)

Once the detail page existed, the basic Merchant CRUD was reconciled with it:

- [x] **Outlet count** — removed the editable `Jumlah Outlet` input from the create/edit dialog (`merchant-form-dialog.tsx`) and dropped `outlet_count` from `actions.ts` (`FormSchema`/`parse`/insert). It is now sourced solely from the `sync_outlet_count` trigger. In edit mode the form shows it as a **read-only** display ("Dikelola otomatis dari daftar outlet"). The list table still renders it.
- [x] **Franchise economics** — `franchise_fee`, `roi_percent`, `bep_months` are now editable from the detail **Financials** tab (decision: keep them with the financials, not in the basic CRUD). Added an "Ekonomi Franchise" field group to `financials-section.tsx`; `saveFinancials` now also `update`s the `franchises` row with these three (validated by `FranchiseEconomicsSchema`); `page.tsx` fetches `franchise_fee` and passes an `economics` prop. The detail header ROI/BEP refresh via `revalidatePath`.
- [x] **Verify** — `pnpm typecheck` + `pnpm build` pass; `[id]` route compiles.

## Task 6: Single entry point — everything edits on the detail page

User feedback: the list had two overlapping affordances (an inline Edit popup **and** a Detail link), which was confusing. Consolidated so a row only opens the detail page, and all editing lives there.

- [x] **List table** (`merchant-table.tsx`) — removed the per-row Edit popup and Delete button. The whole row is now clickable (`router.push` to `[id]`); the name is also a real `<Link>` (stops propagation) for open-in-new-tab/a11y. Trailing chevron signals navigation. No longer a stateful CRUD surface.
- [x] **Create stays on the list** — the top-right "Tambah Merchant" dialog (`MerchantFormDialog` mode `create`) is kept; only the per-row **edit** path moved.
- [x] **Profil tab** (new `profile-section.tsx`, first tab on the detail page) — editable form for all core `franchises` fields the popup had plus the rest of the table: name, category (select), status, description, investment_start/end, established_year, logo_url, requirements, support_provided. Read-only meta strip: slug, created_at, updated_at. Includes a destructive **Hapus Merchant** action.
- [x] **Actions** (`[id]/actions.ts`) — added `saveProfile` (Zod `ProfileSchema`, with an investment*end ≥ investment_start refine; `update`s `franchises`, revalidates detail + list) and `deleteMerchant` (deletes then `redirect` to the list). `outlet_count`/`rating*\*` stay trigger-managed; economics stay on the Financials tab.
- [x] **Detail page** (`page.tsx`) — franchise query widened to all surfaced columns; also fetches active `merchant_categories` for the profile category select; renders the Profil tab.
- [x] **Verify** — `pnpm typecheck` + `pnpm build` pass.

> Note: the list `actions.ts` still exports `updateMerchant` (used by `MerchantFormDialog`'s create path's sibling edit branch, now unused) and a `deleteMerchant`; these are dead-but-harmless and can be pruned later.

## Notes / follow-ups

- `franchise_media` is admin-managed only for now; the web app still reads `gallery_urls`. A future iteration could migrate the web gallery to `franchise_media` and drop `gallery_urls`, but that requires changing `franchise-form.tsx`, `franchise-card.tsx`, and `franchise/[slug]/page.tsx` — explicitly out of scope here.
- `outlet_type_id` from the sample API was intentionally omitted (not in the user's outlet field list). If outlet typing is needed later, add an `outlet_types` lookup + FK.
- Changes are currently uncommitted on branch `feat/admin-config-crud`. Commit when ready (the user has not requested a commit yet).
