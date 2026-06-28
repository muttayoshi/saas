# Property CRUD — Full Specs, Location & Detail Page

**Date:** 2026-06-25
**Status:** Approved (design)
**Area:** `apps/admin` → `dashboard/config/properties`

## Goal

Complete the admin property feature so a landlord/admin can publish a commercial
property (ruko / kios / lapak) **for rent or for sale**, with detailed
specifications, location, and supporting media. Mirror the existing
**merchant detail** pattern (list → detail page with tabs → section components →
form dialogs → `[id]/actions.ts`).

Currently the `properties` table already defines `latitude`, `longitude`,
`traffic_score`, `nearby_facilities[]`, and `gallery_urls[]`, but the form does
not expose them, there is no description, and only rent (`monthly_rent`) is
supported. This work exposes the existing fields, adds sale support, adds
commercial spec fields, and adds a detail page.

## Decisions (from brainstorming)

- **Listing model:** rent **and** sale (`listing_type` = `sewa | jual | sewa_jual`).
- **Spec depth:** full set of new spec fields (all optional).
- **Detail UX:** separate detail page `/config/properties/[id]` with tabs,
  consistent with merchant detail.
- **Media:** gallery via manual **URL input** (same as merchant media), no file
  upload to Storage.
- **Location:** plain lat/lng number inputs + a "Buka di Google Maps" link.
  No interactive Mapbox map in admin.

## 1. Data Model — migration `supabase/migrations/010_extend_properties.sql`

New enums:

- `property_listing_type`: `sewa | jual | sewa_jual`
- `property_certificate`: `shm | hgb | shgb | strata | lainnya`
- `property_furnished`: `unfurnished | semi | full`

New columns on `properties` (all nullable unless noted):

| Column              | Type                                              | Meaning                                 |
| ------------------- | ------------------------------------------------- | --------------------------------------- |
| `listing_type`      | `property_listing_type` NOT NULL DEFAULT `'sewa'` | sewa / jual / keduanya                  |
| `sale_price`        | `BIGINT`                                          | harga jual                              |
| `description`       | `TEXT`                                            | deskripsi & spek naratif                |
| `building_size_sqm` | `NUMERIC(10,2)`                                   | luas bangunan (`size_sqm` = luas tanah) |
| `floors`            | `INTEGER`                                         | jumlah lantai                           |
| `bathrooms`         | `INTEGER`                                         | jumlah kamar mandi                      |
| `parking_spaces`    | `INTEGER`                                         | kapasitas parkir                        |
| `frontage_m`        | `NUMERIC(6,2)`                                    | lebar depan / muka (meter)              |
| `electrical_va`     | `INTEGER`                                         | daya listrik (VA)                       |
| `certificate`       | `property_certificate`                            | jenis sertifikat                        |
| `furnished`         | `property_furnished`                              | kondisi furnitur                        |
| `year_built`        | `INTEGER`                                         | tahun dibangun                          |

Also:

- `ALTER COLUMN monthly_rent DROP NOT NULL` — jual-only listings have no rent.
  The existing `properties_rent_check (monthly_rent > 0)` stays: a NULL value
  evaluates to UNKNOWN and passes the CHECK, so no change needed there.
- Optional non-negative CHECKs for `sale_price`, `building_size_sqm`, `floors`,
  `bathrooms`, `parking_spaces`, `frontage_m`, `electrical_va`, `year_built`
  (each `IS NULL OR value > 0`, `year_built` between 1900 and current year + 1).

Price validity (at least one price matching `listing_type`) is enforced in the
app layer (Zod), not the DB, to keep the migration simple.

**Note:** Per `CLAUDE.md`, `supabase/migrations/006_rls_policies.sql` is a stub —
RLS lives in Supabase Cloud. The new columns are covered by existing
table-level RLS, so no policy change is expected. Apply via `pnpm db:migrate`.

## 2. Types — `packages/types/src/property.ts`

- Add `PropertyListingTypeSchema`, `PropertyCertificateSchema`,
  `PropertyFurnishedSchema` enums + inferred types.
- Add bilingual label maps: `PropertyListingTypeLabels`,
  `PropertyCertificateLabels`, `PropertyFurnishedLabels` (id/en), following the
  `PropertyTypeLabels` shape.
- Extend `PropertySchema`:
  - `monthly_rent` → `.int().positive().nullable()`
  - add `listing_type` (default `sewa`), `sale_price`, `description`,
    `building_size_sqm`, `floors`, `bathrooms`, `parking_spaces`, `frontage_m`,
    `electrical_va`, `certificate`, `furnished`, `year_built` (all nullable
    except `listing_type`).
- `CreatePropertySchema` / `UpdatePropertySchema` stay derived via
  `.omit()` / `.partial()`.
- No `index.ts` change needed: it already does `export * from "./property"`, so
  new enums/labels are re-exported automatically.

## 3. List page — `config/properties/page.tsx` + `_components`

- Select query adds `listing_type`, `sale_price` (and keeps existing columns).
- `PropertyRow` type extended accordingly.
- **`property-table.tsx`:**
  - Title cell becomes a link to `/dashboard/config/properties/[id]`.
  - Add a **listing type** badge column.
  - Price column shows rent and/or sale price based on `listing_type`
    (e.g. `Rp x/bln`, `Rp y`, or both).
  - Keep edit dialog + delete as-is.
- **`property-form-dialog.tsx` (create stays light):** title, property_type,
  listing_type, city, province, and the price field(s) shown conditionally by
  listing_type (rent when `sewa`/`sewa_jual`, sale when `jual`/`sewa_jual`),
  address, size_sqm, status. Rich specs are edited on the detail page.
  This matches the merchant pattern (create light → enrich on detail).

## 4. Detail page — `config/properties/[id]/page.tsx`

Server component: fetch the property by `id` (`notFound()` if missing). Header
shows title + status badge + listing-type badge + city. Body is a `Tabs` card
(mirroring merchant detail) with three tabs, each a section client component:

- **Spek & Harga** (`spec-section.tsx`) — edits: title, property_type,
  listing_type, monthly_rent, sale_price, size_sqm, building_size_sqm, floors,
  bathrooms, parking_spaces, frontage_m, electrical_va, certificate, furnished,
  year_built, description, status. One dialog/form; price fields conditional on
  listing_type.
- **Lokasi** (`location-section.tsx`) — edits: address, city, province,
  latitude, longitude, traffic_score, nearby_facilities (tag-style add/remove
  list serialized to `text[]`). Displays a "Buka di Google Maps" link built from
  lat/lng when both present.
- **Galeri** (`gallery-section.tsx`) — manages `gallery_urls` (`text[]`, max 10):
  add a URL, remove, reorder. Same URL-input approach as merchant media; renders
  thumbnails via `next/image` (Supabase public URLs are already whitelisted).

## 5. Server actions

- Extend `config/properties/actions.ts` `FormSchema` for the new create fields
  (listing_type + conditional price), keep `createProperty` / `updateProperty` /
  `deleteProperty`.
- New `config/properties/[id]/actions.ts` with section update actions:
  `updatePropertySpec`, `updatePropertyLocation`, `updatePropertyGallery`
  (each parses its own FormData/payload, updates `properties`, `revalidatePath`
  the detail + list routes). Same `ActionResult` shape as merchant actions.

## Out of scope (YAGNI)

- File upload to Supabase Storage; interactive Mapbox map in admin.
- Public-facing web changes (`apps/web`) — only the admin config flow here.
- Lead/inquiry wiring for properties.

## Testing / verification

No test runner is configured (per `CLAUDE.md`). Verification gate:
`pnpm typecheck` and `pnpm build`, plus manual smoke test of create → detail →
edit each tab → delete in the admin app (`:3001`). Run the migration with
`pnpm db:migrate` before testing.
