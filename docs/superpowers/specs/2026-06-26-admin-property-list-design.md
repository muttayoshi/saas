# Admin Property List — Design

**Date:** 2026-06-26
**App:** `@app/admin`
**Status:** Approved

## Goal

Build the top-level **"Properti"** menu page (`/dashboard/properties`) — currently a dead
nav link. It is an **operational list** of properties with server-side search and filters,
distinct from the existing master-data CRUD at `/dashboard/config/properties`.

The sibling pattern is "Merchant List" (`/dashboard/franchises`), but this page adds search
and filtering instead of summary cards.

## Scope

**In scope**

- Read-only operational list of all rows from the `properties` table.
- Server-side filtering via URL `searchParams`:
  - `q` — text search across `title` and `address` (case-insensitive).
  - `type` — `property_type` (ruko/kios/gudang/kantor/lainnya).
  - `listing` — `listing_type` (sewa/jual/sewa_jual).
  - `status` — (available/rented/draft).
  - `city` — exact match against distinct cities present in data.
- Title links to the existing detail page `/dashboard/config/properties/[id]`.

**Out of scope**

- Summary/breakdown cards.
- Inline status changes or any editing (stays in config CRUD).
- A separate detail page (reuse config detail).
- Pagination (not needed at current data volume; revisit later).

## Architecture

### `apps/admin/src/app/dashboard/properties/page.tsx` (Server Component)

- Signature uses Next.js 16 **async `searchParams`**:
  `{ searchParams }: { searchParams: Promise<{ q?; type?; listing?; status?; city? }> }`,
  awaited before use.
- Builds the Supabase query on `properties` selecting the same columns the config page uses:
  `id, title, property_type, listing_type, address, city, province, monthly_rent, sale_price, size_sqm, status, created_at`,
  ordered by `created_at desc`.
- Applies filters conditionally:
  - `q` → `.or("title.ilike.%q%,address.ilike.%q%")` (escape `%`/`,` in input).
  - `type`/`listing`/`status`/`city` → `.eq(...)` when present and non-empty.
- Computes the **distinct city list** for the city dropdown. Run as a separate lightweight
  query (`select("city")` over all rows, dedupe + sort in JS) so the options are stable
  regardless of the active filters.
- Renders: page header, `<PropertyFilters>` (passing current params + city options),
  and `<PropertyListTable>` (passing filtered rows).

### `_components/property-filters.tsx` (Client Component)

- Props: current filter values + `cities: string[]`.
- A search `Input` (debounced ~300ms) + four `Select` dropdowns (type, listing, status, city),
  each with an "All" option. Plus a **Reset** button.
- On any change, builds a new `URLSearchParams` (dropping empty values) and calls
  `router.replace(`${pathname}?${params}`)` so the server re-queries. Uses
  `useRouter`/`usePathname`/`useSearchParams` from `next/navigation`.
- Labels come from `PropertyTypeLabels` / `PropertyListingTypeLabels` (`@app/types`);
  status options use the raw enum values (matching the config table's display).

### `_components/property-list-table.tsx` (Server Component, read-only)

- Props: `properties: PropertyRow[]`.
- Same column layout as the config table — Judul, Tipe, Listing, Kota, Harga, Status —
  but **no Aksi column** (no edit/delete).
- Title cell links to `/dashboard/config/properties/[id]`.
- Empty state: dashed-border "Tidak ada properti yang cocok" (or "Belum ada properti"
  when no filters are active).

### Shared `formatPrice` helper

- The config table (`config/properties/_components/property-table.tsx`) defines a private
  `formatPrice(p)`. Lift it to a shared location (e.g.
  `apps/admin/src/lib/property.ts`) and import it from both tables to avoid divergence.
- The `PropertyRow` type is currently exported from `property-form-dialog.tsx`. The new
  table needs the same shape; import that type (or move it alongside the shared helper) —
  do not redefine the row shape locally.

## Reuse / Conventions

- Enums + bilingual labels from `@app/types`; `formatCurrency` from `@app/utils`.
- shadcn primitives from `@/components/ui` (`Input`, `Select`, `Button`, `Badge`, `Card`).
- Status → badge variant mapping mirrors the config table
  (`available: default, rented: secondary, draft: outline`).
- Indonesian-first copy.

## Testing / Verification

- No test runner in repo. Gate with `pnpm typecheck` (and `pnpm build` for the admin app).
- Manual: navigate to `/dashboard/properties`; verify each filter narrows results, search
  matches title and address, city dropdown lists actual cities, Reset clears params, the URL
  reflects active filters (deep-link reload reproduces the filtered view), and title links
  open the config detail page.
