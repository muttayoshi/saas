# Merchant Detail — Financials, Outlets, Ratings & Media

**Date:** 2026-06-25
**Status:** ✅ Implemented & verified (typecheck + build + `db:migrate` pass)
**App scope:** `apps/admin` (`@app/admin`), with shared type additions in `@app/types` and a DB migration in `supabase/migrations/`. The customer-facing `web` app is intentionally **not** modified.

## Goal

Extend the admin app's merchant feature with a **detail page**. Today a merchant _is_ a row in the `franchises` table (no separate `merchants` table). The merchant CRUD lives at `apps/admin/src/app/dashboard/config/merchants` and follows the repo pattern: server-component fetch → client dialog/table → server actions, validated by Zod schemas in `@app/types`.

A sample detail API response (below) shows richer per-merchant data we did not yet model — financial estimates and a list of **outlets**. We add the missing tables + Zod schemas, and build a merchant **detail page** that manages financials, outlets, ratings, and media for a franchise.

### Source sample API response

```json
{
  "data": {
    "id": 76,
    "merchant_id": 269,
    "est_gross_profit": "900000000",
    "est_net_profit": "106666667",
    "roi": "7.00",
    "bep": "17",
    "pos": 1,
    "resources": 1,
    "construction": 1,
    "additional_fees": [],
    "outlets": [
      {
        "id": 1702,
        "gmap": "https://www.google.com/maps?q=-6.221853599999999,106.6980959",
        "name": "Oseng Endok Ciledug",
        "phone": null,
        "address": "QMHX+66X, Jl. KH. Hasyim Ashari, ...",
        "photo_url": null,
        "outlet_type_id": 6
      }
    ]
  },
  "message": "success",
  "code": 200
}
```

## Decisions (confirmed with user)

- **Merchant = the existing `franchises` entity.** No new "merchant" table.
- **Financials → a separate 1:1 `franchise_financials` table** (mirrors the detail endpoint).
- **`roi` / `bep` are reused** from the existing `franchises.roi_percent` / `bep_months` columns — not duplicated in the financials table.
- **`outlet_type_id` from the sample is intentionally omitted** — user's explicit outlet field list was `gmap, name, phone, address, photo_url`.
- **Ratings → `franchise_ratings` rows plus `rating_avg` / `rating_count` aggregate columns on `franchises`**, kept in sync by a DB trigger.
- **Media → new `franchise_media` table alongside the existing `franchises.gallery_urls`** (column kept; no migration/drop). Media holds a `url` only and a `type` (image | video). The web app stays untouched; the admin media manager is the richer source going forward.

## Key constraint: do not break the `web` app

The customer `web` app actively writes `franchises.gallery_urls` (`apps/web/src/app/dashboard/franchises/_components/franchise-form.tsx`) and reads it in `franchise-card.tsx` and `franchise/[slug]/page.tsx`. Therefore `gallery_urls` is **kept as-is** — `franchise_media` is added alongside, with no migration and no web changes. Work is fully admin-isolated.

## Data model (migration `009_merchant_detail.sql`)

Conventions follow `002`/`007`: UUID PKs `DEFAULT gen_random_uuid()`, `TIMESTAMPTZ DEFAULT NOW()` for `created_at`/`updated_at`, `BEFORE UPDATE` trigger calling the existing `update_updated_at()` function, `idx_<table>_<col>` indexes, and RLS (public read for published franchises' children + owner + admin full access).

### Enum

```sql
CREATE TYPE media_type AS ENUM ('image', 'video');  -- guarded by DO/EXCEPTION duplicate_object
```

### `franchises` (altered — `gallery_urls` kept)

```sql
ALTER TABLE franchises
  ADD COLUMN IF NOT EXISTS rating_avg   NUMERIC(2,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INTEGER      NOT NULL DEFAULT 0;
```

### `franchise_financials` (1:1)

| column                  | type        | notes                                                           |
| ----------------------- | ----------- | --------------------------------------------------------------- |
| id                      | UUID PK     | `gen_random_uuid()`                                             |
| franchise_id            | UUID        | **UNIQUE** NOT NULL REFERENCES franchises(id) ON DELETE CASCADE |
| est_gross_profit        | BIGINT      | nullable                                                        |
| est_net_profit          | BIGINT      | nullable                                                        |
| pos                     | INTEGER     | nullable                                                        |
| resources               | INTEGER     | nullable                                                        |
| construction            | INTEGER     | nullable                                                        |
| created_at / updated_at | TIMESTAMPTZ | + `update_updated_at` trigger                                   |

### `franchise_additional_fees` (financials' `additional_fees[]`)

`id` UUID PK · `franchise_id` UUID NOT NULL FK CASCADE · `name` TEXT NOT NULL · `amount` BIGINT · timestamps + trigger · index on `franchise_id`.

### `outlets` (1 franchise → many)

`id` UUID PK · `franchise_id` UUID NOT NULL FK CASCADE · `name` TEXT NOT NULL · `gmap` TEXT · `phone` TEXT · `address` TEXT · `photo_url` TEXT · timestamps + trigger · index on `franchise_id`.
Trigger `sync_outlet_count()` AFTER INSERT OR DELETE → updates `franchises.outlet_count`.

### `franchise_ratings`

`id` UUID PK · `franchise_id` UUID NOT NULL FK CASCADE · `score` SMALLINT NOT NULL CHECK (1–5) · `reviewer_name` TEXT · `comment` TEXT · timestamps + trigger · index on `franchise_id`.
Trigger `sync_rating_aggregate()` AFTER INSERT/UPDATE/DELETE → updates `franchises.rating_avg` (`ROUND(AVG,1)`) and `rating_count`.

### `franchise_media`

`id` UUID PK · `franchise_id` UUID NOT NULL FK CASCADE · `url` TEXT NOT NULL · `type` media_type NOT NULL DEFAULT 'image' · `caption` TEXT · `sort_order` INTEGER NOT NULL DEFAULT 0 · timestamps + trigger · index on `(franchise_id, sort_order)`.

### RLS

All 5 new tables: `_public_read` (parent franchise `published`), `_owner_all` (`franchise.owner_id = auth.uid()`), `_admin_all` (`profiles.role = 'admin'`). `DROP POLICY IF EXISTS` guards to avoid collisions with MCP-applied policies.

## Types (`@app/types`)

New files, each mirroring the `Schema` / `CreateSchema` (`.omit` id+timestamps) / `UpdateSchema` (`.partial`) pattern:

- `outlet.ts` — `OutletSchema` { id, franchise_id, name (2–100), gmap (url, nullable), phone (max 30, nullable), address (nullable), photo_url (url, nullable), timestamps } + Create/Update.
- `franchise-financials.ts` — `FranchiseFinancialsSchema` (est_gross_profit, est_net_profit, pos, resources, construction — all `int().min(0).nullable()`) + `FranchiseAdditionalFeeSchema` (name 1–100, amount nullable) + Create/Update for both.
- `franchise-rating.ts` — `FranchiseRatingSchema` { score int 1–5, reviewer_name (max 100, nullable), comment (nullable) } + Create/Update.
- `franchise-media.ts` — `MediaTypeSchema = z.enum(["image","video"])`, `MediaTypeLabels` (bilingual: Gambar/Image, Video/Video), `FranchiseMediaSchema` { url, type, caption (max 200, nullable), sort_order int min 0 } + Create/Update.

Edited `franchise.ts`: add `rating_avg` (0–5, optional) + `rating_count` (int min 0, optional) to `FranchiseSchema`, and add both to the `.omit()` in `CreateFranchiseSchema` (server-managed). `gallery_urls` left unchanged. Four new files exported from `src/index.ts`.

## Admin UI — detail page

New dynamic route `apps/admin/src/app/dashboard/config/merchants/[id]/`:

- `page.tsx` (Server Component) — `const { id } = await params` (Next 16 async params); `await createClient()`; fetch franchise (with `merchant_categories(name_id)` join, including `rating_avg`/`rating_count`/`roi_percent`/`bep_months`), then `Promise.all` for financials (`maybeSingle`), additional fees, outlets, ratings, media. `notFound()` if missing. Renders a header (name, status badge, category badge, outlet count, star rating, ROI, BEP) + `Tabs` (Financials / Outlets / Ratings / Media). Back link to the list.
- `actions.ts` (`"use server"`) — `saveFinancials` (upsert `onConflict: "franchise_id"`), `createFee`/`updateFee`/`deleteFee`, `createOutlet`/`updateOutlet`/`deleteOutlet`, `createRating`/`updateRating`/`deleteRating`, `createMedia`/`updateMedia`/`deleteMedia`. Each Zod-validates, auth-checks via `requireUser()`, mutates, then `revalidatePath`. Reuses `ActionResult = { ok: true } | { ok: false; error: string }`.
- `_components/` — `financials-section.tsx` (upsert form + additional-fees sub-list), `outlets-section.tsx` + `outlet-form-dialog.tsx`, `ratings-section.tsx` + `rating-form-dialog.tsx` (score select 1–5), `media-section.tsx` + `media-form-dialog.tsx` (url + type select + caption + sort_order; `<img>` thumbnail for images, Film icon for video).

Entry point: `merchants/_components/merchant-table.tsx` — merchant name is a `next/link` to `/dashboard/config/merchants/[id]`, plus a per-row Detail (ExternalLink) icon button.

## Verification (all passed)

1. `pnpm db:migrate` — applied `008` (per memory: `DIRECT_URL` = Supabase **Session Pooler**, port 5432).
2. `pnpm typecheck` — 2 successful.
3. `pnpm build` — admin + web build; routes `/dashboard/config/merchants` and `/dashboard/config/merchants/[id]` compiled.
4. Manual smoke (pending user): save financials + a fee; add outlet (→ `outlet_count` trigger); add rating (→ `rating_avg`/`rating_count` trigger); add image + video media.

Note: `pnpm lint` is broken under Next 16 (`next lint` removed); typecheck + build are the gate.
