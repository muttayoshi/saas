# Property CRUD — Full Specs, Location & Detail Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin/landlord publish a commercial property (ruko/kios/lapak) for rent or sale, with full specs, location, and a gallery, managed through a list + detail-page-with-tabs flow that mirrors the existing merchant detail.

**Architecture:** Extend the existing `properties` table (migration) and `@app/types` schema, expose the light create dialog with rent/sale support, then add a detail page at `config/properties/[id]` with three inline-form section tabs (Spek & Harga, Lokasi, Galeri) wired to per-section server actions — exactly the pattern used by `config/merchants/[id]`.

**Tech Stack:** Next.js 16 (App Router, async `cookies()`), React Server Components + server actions, Supabase (`@supabase/ssr`), Zod via `@app/types`, shadcn/ui primitives under `apps/admin/src/components/ui`, Tailwind.

## Global Constraints

- Next.js 16: admin app uses `middleware.ts` (not `proxy.ts`); `cookies()`/`headers()` are async — always `await`. Read `node_modules/next/dist/docs/` before app code if unsure.
- Node >= 22, pnpm >= 11. Run commands from repo root; scope with `pnpm --filter @app/admin`.
- **No test runner exists.** Verification gate is `pnpm typecheck` (and `pnpm build` for the final task) plus the manual smoke test described per task. Never claim a unit-test step.
- `@app/types` is the domain source of truth — define schemas/labels there, import them; never redefine shapes locally.
- Admin consumes UI primitives from `@/components/ui/*` (its own copy), label maps from `@app/types`, helpers from `@app/utils` (`formatCurrency`, `slugify`).
- UI copy is Indonesian-first (`id`).
- Migrations live in `supabase/migrations/`; apply with `pnpm db:migrate`. `DIRECT_URL` must be the Session Pooler (port 5432). RLS lives in Supabase Cloud (migration `006` is a stub) — do not add policies here.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

- `supabase/migrations/010_extend_properties.sql` — **create** — new enums + columns, drop `monthly_rent` NOT NULL.
- `packages/types/src/property.ts` — **modify** — 3 enums + label maps, extend `PropertySchema`.
- `apps/admin/src/app/dashboard/config/properties/actions.ts` — **modify** — list-level create/update schema gains `listing_type` + conditional price.
- `apps/admin/src/app/dashboard/config/properties/page.tsx` — **modify** — select query + props.
- `apps/admin/src/app/dashboard/config/properties/_components/property-table.tsx` — **modify** — link rows, listing badge, rent/sale price.
- `apps/admin/src/app/dashboard/config/properties/_components/property-form-dialog.tsx` — **modify** — listing type + conditional price fields.
- `apps/admin/src/app/dashboard/config/properties/[id]/page.tsx` — **create** — detail page with tabs.
- `apps/admin/src/app/dashboard/config/properties/[id]/actions.ts` — **create** — `updatePropertySpec`, `updatePropertyLocation`, `updatePropertyGallery`, `deletePropertyDetail`.
- `apps/admin/src/app/dashboard/config/properties/[id]/_components/spec-section.tsx` — **create** — inline form, all spec + price fields.
- `apps/admin/src/app/dashboard/config/properties/[id]/_components/location-section.tsx` — **create** — inline form, address/GPS/traffic/facilities.
- `apps/admin/src/app/dashboard/config/properties/[id]/_components/gallery-section.tsx` — **create** — `gallery_urls` array manager.

---

## Task 1: Migration — extend `properties`

**Files:**

- Create: `supabase/migrations/010_extend_properties.sql`

**Interfaces:**

- Produces: new columns on `properties` (`listing_type`, `sale_price`, `description`, `building_size_sqm`, `floors`, `bathrooms`, `parking_spaces`, `frontage_m`, `electrical_va`, `certificate`, `furnished`, `year_built`); new enums `property_listing_type`, `property_certificate`, `property_furnished`; `monthly_rent` now nullable.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/010_extend_properties.sql`:

```sql
-- =============================================================================
-- Migration 010: Extend Properties (sale support, specs, detail fields)
-- =============================================================================

-- New enums
CREATE TYPE property_listing_type AS ENUM ('sewa', 'jual', 'sewa_jual');
CREATE TYPE property_certificate AS ENUM ('shm', 'hgb', 'shgb', 'strata', 'lainnya');
CREATE TYPE property_furnished AS ENUM ('unfurnished', 'semi', 'full');

-- Listing + pricing
ALTER TABLE properties
  ADD COLUMN listing_type property_listing_type NOT NULL DEFAULT 'sewa',
  ADD COLUMN sale_price   BIGINT,
  ADD COLUMN description  TEXT;

-- Jual-only listings have no monthly rent.
-- The existing CHECK (monthly_rent > 0) passes for NULL (evaluates to UNKNOWN).
ALTER TABLE properties ALTER COLUMN monthly_rent DROP NOT NULL;

-- Building specs (all optional)
ALTER TABLE properties
  ADD COLUMN building_size_sqm NUMERIC(10,2),
  ADD COLUMN floors            INTEGER,
  ADD COLUMN bathrooms         INTEGER,
  ADD COLUMN parking_spaces    INTEGER,
  ADD COLUMN frontage_m        NUMERIC(6,2),
  ADD COLUMN electrical_va     INTEGER,
  ADD COLUMN certificate       property_certificate,
  ADD COLUMN furnished         property_furnished,
  ADD COLUMN year_built        INTEGER;

-- Sanity checks (NULL passes each)
ALTER TABLE properties
  ADD CONSTRAINT properties_sale_price_check    CHECK (sale_price IS NULL OR sale_price > 0),
  ADD CONSTRAINT properties_building_size_check CHECK (building_size_sqm IS NULL OR building_size_sqm > 0),
  ADD CONSTRAINT properties_floors_check        CHECK (floors IS NULL OR floors > 0),
  ADD CONSTRAINT properties_bathrooms_check     CHECK (bathrooms IS NULL OR bathrooms >= 0),
  ADD CONSTRAINT properties_parking_check       CHECK (parking_spaces IS NULL OR parking_spaces >= 0),
  ADD CONSTRAINT properties_frontage_check      CHECK (frontage_m IS NULL OR frontage_m > 0),
  ADD CONSTRAINT properties_electrical_check    CHECK (electrical_va IS NULL OR electrical_va > 0),
  ADD CONSTRAINT properties_year_built_check    CHECK (year_built IS NULL OR (year_built >= 1900 AND year_built <= EXTRACT(YEAR FROM NOW())::int + 1));

COMMENT ON COLUMN properties.listing_type      IS 'sewa | jual | sewa_jual';
COMMENT ON COLUMN properties.sale_price         IS 'Sale price in IDR (for jual / sewa_jual)';
COMMENT ON COLUMN properties.building_size_sqm  IS 'Building area m2 (size_sqm = land area)';
COMMENT ON COLUMN properties.electrical_va      IS 'Electrical capacity in VA';
```

- [ ] **Step 2: Apply the migration**

Run: `pnpm db:migrate`
Expected: migration `010_extend_properties` applies with no error. (If it reports IPv6/connection trouble, ensure `DIRECT_URL` is the Session Pooler on port 5432.)

- [ ] **Step 3: Verify columns exist**

Run:

```bash
pnpm db:migrate --help >/dev/null 2>&1; echo "check via Supabase: properties now has listing_type, sale_price, description, building_size_sqm, floors, bathrooms, parking_spaces, frontage_m, electrical_va, certificate, furnished, year_built"
```

Expected: migration already applied; if you have `psql`/Supabase SQL access, `\d properties` shows the new columns and `monthly_rent` is nullable.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/010_extend_properties.sql
git commit -m "feat(db): extend properties with sale support, specs & detail fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Types — extend `PropertySchema` + label maps

**Files:**

- Modify: `packages/types/src/property.ts`

**Interfaces:**

- Consumes: existing `PropertySchema`, `PropertyTypeSchema`, `PropertyStatusSchema`.
- Produces:
  - `PropertyListingType` + `PropertyListingTypeLabels: Record<PropertyListingType, {id;en}>`
  - `PropertyCertificate` + `PropertyCertificateLabels`
  - `PropertyFurnished` + `PropertyFurnishedLabels`
  - `PropertySchema` gains: `listing_type: PropertyListingType`, `sale_price: number|null`, `description: string|null`, `building_size_sqm: number|null`, `floors: number|null`, `bathrooms: number|null`, `parking_spaces: number|null`, `frontage_m: number|null`, `electrical_va: number|null`, `certificate: PropertyCertificate|null`, `furnished: PropertyFurnished|null`, `year_built: number|null`; `monthly_rent` becomes `number|null`.

- [ ] **Step 1: Add enums + label maps**

In `packages/types/src/property.ts`, after the existing `PropertyTypeLabels` block (before `PropertySchema`), add:

```ts
export const PropertyListingTypeSchema = z.enum(["sewa", "jual", "sewa_jual"])
export type PropertyListingType = z.infer<typeof PropertyListingTypeSchema>

export const PropertyListingTypeLabels: Record<
  PropertyListingType,
  { id: string; en: string }
> = {
  sewa: { id: "Disewakan", en: "For Rent" },
  jual: { id: "Dijual", en: "For Sale" },
  sewa_jual: { id: "Sewa / Jual", en: "Rent / Sale" },
}

export const PropertyCertificateSchema = z.enum([
  "shm",
  "hgb",
  "shgb",
  "strata",
  "lainnya",
])
export type PropertyCertificate = z.infer<typeof PropertyCertificateSchema>

export const PropertyCertificateLabels: Record<
  PropertyCertificate,
  { id: string; en: string }
> = {
  shm: { id: "SHM", en: "Freehold (SHM)" },
  hgb: { id: "HGB", en: "Right to Build (HGB)" },
  shgb: { id: "SHGB", en: "SHGB" },
  strata: { id: "Strata Title", en: "Strata Title" },
  lainnya: { id: "Lainnya", en: "Other" },
}

export const PropertyFurnishedSchema = z.enum(["unfurnished", "semi", "full"])
export type PropertyFurnished = z.infer<typeof PropertyFurnishedSchema>

export const PropertyFurnishedLabels: Record<
  PropertyFurnished,
  { id: string; en: string }
> = {
  unfurnished: { id: "Kosong", en: "Unfurnished" },
  semi: { id: "Semi Furnished", en: "Semi Furnished" },
  full: { id: "Furnished", en: "Furnished" },
}
```

- [ ] **Step 2: Extend `PropertySchema`**

Replace the `monthly_rent` line inside `PropertySchema` and append the new fields. The `PropertySchema` object should read:

```ts
export const PropertySchema = z.object({
  id: z.string().uuid(),
  landlord_id: z.string().uuid(),
  title: z.string().min(5).max(150),
  slug: z.string(),
  address: z.string(),
  city: z.string(),
  province: z.string(),
  monthly_rent: z.number().int().positive().nullable(),
  sale_price: z.number().int().positive().nullable(),
  listing_type: PropertyListingTypeSchema,
  size_sqm: z.number().positive(),
  building_size_sqm: z.number().positive().nullable(),
  property_type: PropertyTypeSchema.nullable(),
  floors: z.number().int().positive().nullable(),
  bathrooms: z.number().int().min(0).nullable(),
  parking_spaces: z.number().int().min(0).nullable(),
  frontage_m: z.number().positive().nullable(),
  electrical_va: z.number().int().positive().nullable(),
  certificate: PropertyCertificateSchema.nullable(),
  furnished: PropertyFurnishedSchema.nullable(),
  year_built: z.number().int().min(1900).max(2100).nullable(),
  description: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  traffic_score: z.number().int().min(0).max(100).nullable(),
  nearby_facilities: z.array(z.string()).nullable(),
  gallery_urls: z.array(z.string().url()).max(10).nullable(),
  status: PropertyStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
```

Leave the `CreatePropertySchema` / `UpdatePropertySchema` derivations unchanged — they already `.omit()` / `.partial()`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (If existing web/admin code refers to `monthly_rent` as non-null and now errors, note it — Task 3 handles admin; report any `apps/web` breakage but do NOT change web in this plan.)

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/property.ts
git commit -m "feat(types): property listing type, certificate, furnished + spec fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: List page — rent/sale create + table

**Files:**

- Modify: `apps/admin/src/app/dashboard/config/properties/actions.ts`
- Modify: `apps/admin/src/app/dashboard/config/properties/page.tsx`
- Modify: `apps/admin/src/app/dashboard/config/properties/_components/property-form-dialog.tsx`
- Modify: `apps/admin/src/app/dashboard/config/properties/_components/property-table.tsx`

**Interfaces:**

- Consumes: `PropertyListingTypeSchema`, `PropertyListingTypeLabels` (Task 2).
- Produces: `PropertyRow` type gains `listing_type: string`, `sale_price: number | null`, `monthly_rent: number | null` (used by Task 4's detail link target; detail page does its own fetch).

- [ ] **Step 1: Update create/update action schema**

In `actions.ts`, replace the `FormSchema` and `parse` function with a version that adds `listing_type` and makes price conditional. Import `PropertyListingTypeSchema`:

```ts
import {
  PropertyStatusSchema,
  PropertyTypeSchema,
  PropertyListingTypeSchema,
} from "@app/types"
```

```ts
const FormSchema = z
  .object({
    title: z.string().min(5).max(150),
    property_type: PropertyTypeSchema.nullable(),
    listing_type: PropertyListingTypeSchema,
    address: z.string().min(1),
    city: z.string().min(1),
    province: z.string().min(1),
    monthly_rent: z.coerce.number().int().positive().nullable(),
    sale_price: z.coerce.number().int().positive().nullable(),
    size_sqm: z.coerce.number().positive(),
    status: PropertyStatusSchema,
  })
  .superRefine((v, ctx) => {
    if (v.listing_type !== "jual" && v.monthly_rent == null) {
      ctx.addIssue({
        path: ["monthly_rent"],
        code: z.ZodIssueCode.custom,
        message: "Sewa per bulan wajib diisi untuk listing sewa",
      })
    }
    if (v.listing_type !== "sewa" && v.sale_price == null) {
      ctx.addIssue({
        path: ["sale_price"],
        code: z.ZodIssueCode.custom,
        message: "Harga jual wajib diisi untuk listing jual",
      })
    }
  })

function nullableNumber(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim()
  return s === "" ? null : s
}

function parse(formData: FormData) {
  const type = String(formData.get("property_type") ?? "").trim()
  return FormSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    property_type: type === "" ? null : type,
    listing_type: String(formData.get("listing_type") ?? "sewa"),
    address: String(formData.get("address") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    province: String(formData.get("province") ?? "").trim(),
    monthly_rent: nullableNumber(formData.get("monthly_rent")),
    sale_price: nullableNumber(formData.get("sale_price")),
    size_sqm: formData.get("size_sqm"),
    status: String(formData.get("status") ?? "draft"),
  })
}
```

Leave `createProperty` / `updateProperty` / `deleteProperty` bodies unchanged — they already spread `parsed.data`.

- [ ] **Step 2: Update list page query**

In `page.tsx`, change the `.select(...)` string to include the new columns:

```ts
    .select(
      "id, title, property_type, listing_type, address, city, province, monthly_rent, sale_price, size_sqm, status, created_at"
    )
```

- [ ] **Step 3: Extend `PropertyRow` + create dialog**

In `property-form-dialog.tsx`, extend `PropertyRow` and add a `listing_type` state + conditional price inputs. Replace the type and the component's state/markup:

Update `PropertyRow`:

```ts
export type PropertyRow = {
  id: string
  title: string
  property_type: string | null
  listing_type: string
  address: string | null
  city: string
  province: string
  monthly_rent: number | null
  sale_price: number | null
  size_sqm: number
  status: string
}
```

Add the import and a listing-type constant near `STATUSES`:

```ts
import {
  PropertyTypeLabels,
  PropertyListingTypeLabels,
  type PropertyType,
  type PropertyListingType,
} from "@app/types"
```

```ts
const LISTING_TYPES = Object.keys(PropertyListingTypeLabels) as PropertyListingType[]
```

Add state (next to `type`/`status`):

```ts
const [listingType, setListingType] = useState(property?.listing_type ?? "sewa")
```

In `onSubmit`, after `formData.set("status", status)`:

```ts
formData.set("listing_type", listingType)
```

In `onOpenChange` reset block, after resetting `status`:

```ts
setListingType(property?.listing_type ?? "sewa")
```

Add a "Tipe Listing" select. Put it in the grid row that currently holds Tipe/Status — change that row to three columns and add the listing select, OR add a new row above the price row. Use this new row directly above the price (`monthly_rent`/`size_sqm`) grid:

```tsx
<div className="space-y-2">
  <Label>Tipe Listing</Label>
  <Select value={listingType} onValueChange={setListingType}>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {LISTING_TYPES.map((k) => (
        <SelectItem key={k} value={k}>
          {PropertyListingTypeLabels[k].id}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

Replace the existing price/size grid (`monthly_rent` + `size_sqm`) with conditional pricing + size:

```tsx
<div className="grid grid-cols-2 gap-4">
  {listingType !== "jual" && (
    <div className="space-y-2">
      <Label htmlFor="monthly_rent">Sewa / Bulan (Rp)</Label>
      <Input
        id="monthly_rent"
        name="monthly_rent"
        type="number"
        min={1}
        defaultValue={property?.monthly_rent ?? ""}
      />
    </div>
  )}
  {listingType !== "sewa" && (
    <div className="space-y-2">
      <Label htmlFor="sale_price">Harga Jual (Rp)</Label>
      <Input
        id="sale_price"
        name="sale_price"
        type="number"
        min={1}
        defaultValue={property?.sale_price ?? ""}
      />
    </div>
  )}
  <div className="space-y-2">
    <Label htmlFor="size_sqm">Luas Tanah (m²)</Label>
    <Input
      id="size_sqm"
      name="size_sqm"
      type="number"
      min={1}
      step="0.01"
      defaultValue={property?.size_sqm}
      required
    />
  </div>
</div>
```

- [ ] **Step 4: Update the table (link rows, listing badge, price)**

In `property-table.tsx`:

Add imports:

```ts
import Link from "next/link"
import { PropertyListingTypeLabels } from "@app/types"
```

Add a `formatPrice` helper above the component:

```tsx
function formatPrice(p: PropertyRow) {
  const parts: string[] = []
  if (p.listing_type !== "jual" && p.monthly_rent != null) {
    parts.push(`${formatCurrency(p.monthly_rent)}/bln`)
  }
  if (p.listing_type !== "sewa" && p.sale_price != null) {
    parts.push(formatCurrency(p.sale_price))
  }
  return parts.length ? parts.join(" · ") : "-"
}
```

Change the header row to add a "Listing" column and rename "Sewa/Bln" to "Harga":

```tsx
            <th className="px-3 py-3 font-medium">Judul</th>
            <th className="px-3 py-3 font-medium">Tipe</th>
            <th className="px-3 py-3 font-medium">Listing</th>
            <th className="px-3 py-3 font-medium">Kota</th>
            <th className="px-3 py-3 font-medium">Harga</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 text-right font-medium">Aksi</th>
```

Make the title a link and add the listing badge + price cells. Replace the title cell and add the listing cell + price cell:

```tsx
              <td className="px-3 py-3 font-medium">
                <Link
                  href={`/dashboard/config/properties/${p.id}`}
                  className="hover:text-primary hover:underline"
                >
                  {p.title}
                </Link>
              </td>
              <td className="px-3 py-3">
                <Badge variant="secondary">
                  {p.property_type
                    ? (PropertyTypeLabels[p.property_type as PropertyType]?.id ??
                      p.property_type)
                    : "-"}
                </Badge>
              </td>
              <td className="px-3 py-3">
                <Badge variant="outline">
                  {PropertyListingTypeLabels[
                    p.listing_type as keyof typeof PropertyListingTypeLabels
                  ]?.id ?? p.listing_type}
                </Badge>
              </td>
              <td className="text-muted-foreground px-3 py-3">{p.city}</td>
              <td className="text-muted-foreground px-3 py-3">{formatPrice(p)}</td>
```

(Remove the old single `monthly_rent` price cell that used `formatCurrency(p.monthly_rent)`.)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Manual smoke**

Run: `pnpm --filter @app/admin dev` → open `http://localhost:3001/dashboard/config/properties`.
Expected: table shows Listing column; "Tambah Properti" dialog shows Tipe Listing; choosing "Dijual" hides rent and shows Harga Jual; create a `sewa_jual` property → both prices show in the table as `Rp …/bln · Rp …`.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/app/dashboard/config/properties/actions.ts apps/admin/src/app/dashboard/config/properties/page.tsx apps/admin/src/app/dashboard/config/properties/_components/property-form-dialog.tsx apps/admin/src/app/dashboard/config/properties/_components/property-table.tsx
git commit -m "feat(admin): property list — rent/sale listing type & price

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Detail page + Spek & Harga section

**Files:**

- Create: `apps/admin/src/app/dashboard/config/properties/[id]/page.tsx`
- Create: `apps/admin/src/app/dashboard/config/properties/[id]/actions.ts`
- Create: `apps/admin/src/app/dashboard/config/properties/[id]/_components/spec-section.tsx`

**Interfaces:**

- Consumes: `PropertyTypeLabels`, `PropertyListingTypeLabels`, `PropertyCertificateLabels`, `PropertyFurnishedLabels` and their types (Task 2).
- Produces (from `[id]/actions.ts`, used by Tasks 5 & 6):
  - `type ActionResult = { ok: true } | { ok: false; error: string }`
  - `updatePropertySpec(propertyId: string, formData: FormData): Promise<ActionResult>`
  - `deletePropertyDetail(propertyId: string): Promise<ActionResult>` (redirects on success)
  - helpers re-used by sibling sections: `updatePropertyLocation` (Task 5), `updatePropertyGallery` (Task 6) are added to this same file in later tasks.

- [ ] **Step 1: Create `[id]/actions.ts` with shared helpers + spec/delete actions**

```ts
"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import {
  PropertyStatusSchema,
  PropertyTypeSchema,
  PropertyListingTypeSchema,
  PropertyCertificateSchema,
  PropertyFurnishedSchema,
} from "@app/types"

export type ActionResult = { ok: true } | { ok: false; error: string }

const LIST_PATH = "/dashboard/config/properties"

function pathFor(id: string) {
  return `/dashboard/config/properties/${id}`
}

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Input tidak valid"
}

function nullableText(formData: FormData, key: string) {
  const s = String(formData.get(key) ?? "").trim()
  return s === "" ? null : s
}

function nullableNumber(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim()
  return s === "" ? null : s
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, error: "Tidak terautentikasi" as const }
  return { supabase, error: null }
}

// -- Spek & Harga ------------------------------------------------------------

const SpecSchema = z
  .object({
    title: z.string().min(5, "Judul minimal 5 karakter").max(150),
    property_type: PropertyTypeSchema.nullable(),
    listing_type: PropertyListingTypeSchema,
    status: PropertyStatusSchema,
    monthly_rent: z.coerce.number().int().positive().nullable(),
    sale_price: z.coerce.number().int().positive().nullable(),
    size_sqm: z.coerce.number().positive("Luas tanah wajib diisi"),
    building_size_sqm: z.coerce.number().positive().nullable(),
    floors: z.coerce.number().int().positive().nullable(),
    bathrooms: z.coerce.number().int().min(0).nullable(),
    parking_spaces: z.coerce.number().int().min(0).nullable(),
    frontage_m: z.coerce.number().positive().nullable(),
    electrical_va: z.coerce.number().int().positive().nullable(),
    certificate: PropertyCertificateSchema.nullable(),
    furnished: PropertyFurnishedSchema.nullable(),
    year_built: z.coerce.number().int().min(1900).max(2100).nullable(),
    description: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.listing_type !== "jual" && v.monthly_rent == null) {
      ctx.addIssue({
        path: ["monthly_rent"],
        code: z.ZodIssueCode.custom,
        message: "Sewa per bulan wajib diisi untuk listing sewa",
      })
    }
    if (v.listing_type !== "sewa" && v.sale_price == null) {
      ctx.addIssue({
        path: ["sale_price"],
        code: z.ZodIssueCode.custom,
        message: "Harga jual wajib diisi untuk listing jual",
      })
    }
  })

export async function updatePropertySpec(
  propertyId: string,
  formData: FormData
): Promise<ActionResult> {
  const type = String(formData.get("property_type") ?? "").trim()
  const cert = String(formData.get("certificate") ?? "").trim()
  const furn = String(formData.get("furnished") ?? "").trim()
  const parsed = SpecSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    property_type: type === "" ? null : type,
    listing_type: String(formData.get("listing_type") ?? "sewa"),
    status: String(formData.get("status") ?? "draft"),
    monthly_rent: nullableNumber(formData.get("monthly_rent")),
    sale_price: nullableNumber(formData.get("sale_price")),
    size_sqm: formData.get("size_sqm"),
    building_size_sqm: nullableNumber(formData.get("building_size_sqm")),
    floors: nullableNumber(formData.get("floors")),
    bathrooms: nullableNumber(formData.get("bathrooms")),
    parking_spaces: nullableNumber(formData.get("parking_spaces")),
    frontage_m: nullableNumber(formData.get("frontage_m")),
    electrical_va: nullableNumber(formData.get("electrical_va")),
    certificate: cert === "" ? null : cert,
    furnished: furn === "" ? null : furn,
    year_built: nullableNumber(formData.get("year_built")),
    description: nullableText(formData, "description"),
  })
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }

  const { supabase, error: authError } = await requireUser()
  if (authError) return { ok: false, error: authError }

  const { error } = await supabase
    .from("properties")
    .update(parsed.data)
    .eq("id", propertyId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(pathFor(propertyId))
  revalidatePath(LIST_PATH)
  return { ok: true }
}

export async function deletePropertyDetail(propertyId: string): Promise<ActionResult> {
  const { supabase, error: authError } = await requireUser()
  if (authError) return { ok: false, error: authError }
  const { error } = await supabase.from("properties").delete().eq("id", propertyId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}
```

- [ ] **Step 2: Create `spec-section.tsx` (inline form)**

```tsx
"use client"

import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"
import {
  PropertyTypeLabels,
  PropertyListingTypeLabels,
  PropertyCertificateLabels,
  PropertyFurnishedLabels,
  type PropertyType,
  type PropertyListingType,
  type PropertyCertificate,
  type PropertyFurnished,
} from "@app/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updatePropertySpec, deletePropertyDetail } from "../actions"

export type PropertySpec = {
  title: string
  property_type: string | null
  listing_type: string
  status: string
  monthly_rent: number | null
  sale_price: number | null
  size_sqm: number
  building_size_sqm: number | null
  floors: number | null
  bathrooms: number | null
  parking_spaces: number | null
  frontage_m: number | null
  electrical_va: number | null
  certificate: string | null
  furnished: string | null
  year_built: number | null
  description: string | null
}

const STATUSES = [
  { value: "available", label: "Tersedia" },
  { value: "rented", label: "Disewa" },
  { value: "draft", label: "Draft" },
]

const NONE = "__none__"
const TYPE_KEYS = Object.keys(PropertyTypeLabels) as PropertyType[]
const LISTING_KEYS = Object.keys(PropertyListingTypeLabels) as PropertyListingType[]
const CERT_KEYS = Object.keys(PropertyCertificateLabels) as PropertyCertificate[]
const FURN_KEYS = Object.keys(PropertyFurnishedLabels) as PropertyFurnished[]

export function SpecSection({
  propertyId,
  spec,
}: {
  propertyId: string
  spec: PropertySpec
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const [deleting, startDelete] = useTransition()
  const [type, setType] = useState(spec.property_type ?? NONE)
  const [listingType, setListingType] = useState(spec.listing_type)
  const [status, setStatus] = useState(spec.status)
  const [certificate, setCertificate] = useState(spec.certificate ?? NONE)
  const [furnished, setFurnished] = useState(spec.furnished ?? NONE)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const formData = new FormData(e.currentTarget)
    formData.set("property_type", type === NONE ? "" : type)
    formData.set("listing_type", listingType)
    formData.set("status", status)
    formData.set("certificate", certificate === NONE ? "" : certificate)
    formData.set("furnished", furnished === NONE ? "" : furnished)
    startTransition(async () => {
      const res = await updatePropertySpec(propertyId, formData)
      if (res.ok === false) setError(res.error)
      else setSaved(true)
    })
  }

  function onDelete() {
    if (!confirm(`Hapus properti "${spec.title}"? Tindakan ini permanen.`)) return
    startDelete(async () => {
      const res = await deletePropertyDetail(propertyId)
      if (res?.ok === false) alert(res.error)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <div className="space-y-4">
        <h3 className="font-semibold">Informasi & Harga</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="title">Judul</Label>
            <Input id="title" name="title" defaultValue={spec.title} required />
          </div>
          <div className="space-y-2">
            <Label>Tipe Properti</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {TYPE_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {PropertyTypeLabels[k].id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipe Listing</Label>
            <Select value={listingType} onValueChange={setListingType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LISTING_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {PropertyListingTypeLabels[k].id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {listingType !== "jual" && (
            <div className="space-y-2">
              <Label htmlFor="monthly_rent">Sewa / Bulan (Rp)</Label>
              <Input
                id="monthly_rent"
                name="monthly_rent"
                type="number"
                min={1}
                defaultValue={spec.monthly_rent ?? ""}
              />
            </div>
          )}
          {listingType !== "sewa" && (
            <div className="space-y-2">
              <Label htmlFor="sale_price">Harga Jual (Rp)</Label>
              <Input
                id="sale_price"
                name="sale_price"
                type="number"
                min={1}
                defaultValue={spec.sale_price ?? ""}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold">Spesifikasi Tempat</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="size_sqm">Luas Tanah (m²)</Label>
            <Input
              id="size_sqm"
              name="size_sqm"
              type="number"
              min={1}
              step="0.01"
              defaultValue={spec.size_sqm}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="building_size_sqm">Luas Bangunan (m²)</Label>
            <Input
              id="building_size_sqm"
              name="building_size_sqm"
              type="number"
              min={1}
              step="0.01"
              defaultValue={spec.building_size_sqm ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="frontage_m">Lebar Depan (m)</Label>
            <Input
              id="frontage_m"
              name="frontage_m"
              type="number"
              min={1}
              step="0.01"
              defaultValue={spec.frontage_m ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="floors">Jumlah Lantai</Label>
            <Input
              id="floors"
              name="floors"
              type="number"
              min={1}
              defaultValue={spec.floors ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bathrooms">Kamar Mandi</Label>
            <Input
              id="bathrooms"
              name="bathrooms"
              type="number"
              min={0}
              defaultValue={spec.bathrooms ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="parking_spaces">Kapasitas Parkir</Label>
            <Input
              id="parking_spaces"
              name="parking_spaces"
              type="number"
              min={0}
              defaultValue={spec.parking_spaces ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="electrical_va">Daya Listrik (VA)</Label>
            <Input
              id="electrical_va"
              name="electrical_va"
              type="number"
              min={1}
              defaultValue={spec.electrical_va ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="year_built">Tahun Dibangun</Label>
            <Input
              id="year_built"
              name="year_built"
              type="number"
              min={1900}
              max={2100}
              defaultValue={spec.year_built ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label>Sertifikat</Label>
            <Select value={certificate} onValueChange={setCertificate}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih sertifikat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {CERT_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {PropertyCertificateLabels[k].id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Kondisi Furnitur</Label>
            <Select value={furnished} onValueChange={setFurnished}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih kondisi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {FURN_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {PropertyFurnishedLabels[k].id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Deskripsi</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={spec.description ?? ""}
          rows={5}
          placeholder="Jelaskan kondisi & keunggulan tempat..."
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="border-border flex items-center justify-between border-t pt-4">
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
          {saved && <span className="text-sm text-emerald-600">Tersimpan</span>}
        </div>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={deleting}
          onClick={onDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {deleting ? "Menghapus..." : "Hapus Properti"}
        </Button>
      </div>
    </form>
  )
}
```

Note: shadcn `Select` cannot use an empty-string `value`, so we use the `NONE` sentinel and translate it to `""` before submit (then the action maps `""` → `null`).

- [ ] **Step 3: Create the detail `page.tsx`**

```tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, MapPin } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PropertyListingTypeLabels } from "@app/types"
import { SpecSection, type PropertySpec } from "./_components/spec-section"

const statusVariant: Record<string, "default" | "secondary" | "outline"> = {
  available: "default",
  rented: "secondary",
  draft: "outline",
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .single()

  if (!property) notFound()

  const galleryCount = (property.gallery_urls ?? []).length

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/config/properties">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali ke daftar properti
          </Button>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold">{property.title}</h1>
          <Badge variant={statusVariant[property.status] ?? "outline"}>
            {property.status}
          </Badge>
          <Badge variant="outline">
            {PropertyListingTypeLabels[
              property.listing_type as keyof typeof PropertyListingTypeLabels
            ]?.id ?? property.listing_type}
          </Badge>
        </div>
        <div className="text-muted-foreground mt-2 flex items-center gap-1 text-sm">
          <MapPin className="h-3.5 w-3.5" />
          {[property.city, property.province].filter(Boolean).join(", ")}
        </div>
      </div>

      <Card className="glass">
        <CardContent className="pt-6">
          <Tabs defaultValue="spec">
            <TabsList className="flex-wrap">
              <TabsTrigger value="spec">Spek & Harga</TabsTrigger>
              <TabsTrigger value="location">Lokasi</TabsTrigger>
              <TabsTrigger value="gallery">Galeri ({galleryCount})</TabsTrigger>
            </TabsList>

            <TabsContent value="spec">
              <SpecSection
                propertyId={id}
                spec={
                  {
                    title: property.title,
                    property_type: property.property_type ?? null,
                    listing_type: property.listing_type,
                    status: property.status,
                    monthly_rent: property.monthly_rent ?? null,
                    sale_price: property.sale_price ?? null,
                    size_sqm: property.size_sqm,
                    building_size_sqm: property.building_size_sqm ?? null,
                    floors: property.floors ?? null,
                    bathrooms: property.bathrooms ?? null,
                    parking_spaces: property.parking_spaces ?? null,
                    frontage_m: property.frontage_m ?? null,
                    electrical_va: property.electrical_va ?? null,
                    certificate: property.certificate ?? null,
                    furnished: property.furnished ?? null,
                    year_built: property.year_built ?? null,
                    description: property.description ?? null,
                  } satisfies PropertySpec
                }
              />
            </TabsContent>

            <TabsContent value="location">
              <p className="text-muted-foreground text-sm">Lokasi — Task 5.</p>
            </TabsContent>
            <TabsContent value="gallery">
              <p className="text-muted-foreground text-sm">Galeri — Task 6.</p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Manual smoke**

With admin dev running, click a property title in the list → detail page loads with header badges + tabs. Edit a field on Spek & Harga → "Tersimpan"; switch listing type to "Dijual" → rent hides, Harga Jual shows. "Hapus Properti" deletes and returns to the list.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/dashboard/config/properties/[id]
git commit -m "feat(admin): property detail page + spek & harga section

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Lokasi section

**Files:**

- Modify: `apps/admin/src/app/dashboard/config/properties/[id]/actions.ts`
- Create: `apps/admin/src/app/dashboard/config/properties/[id]/_components/location-section.tsx`
- Modify: `apps/admin/src/app/dashboard/config/properties/[id]/page.tsx`

**Interfaces:**

- Consumes: `ActionResult`, `pathFor`, `firstError`, `nullableNumber`, `nullableText`, `requireUser` (Task 4).
- Produces: `updatePropertyLocation(propertyId: string, formData: FormData): Promise<ActionResult>` — `nearby_facilities` arrives as a JSON-encoded string field `nearby_facilities`.

- [ ] **Step 1: Add `updatePropertyLocation` to `[id]/actions.ts`**

Append to `[id]/actions.ts`:

```ts
// -- Lokasi ------------------------------------------------------------------

const LocationSchema = z.object({
  address: z.string().min(1, "Alamat wajib diisi"),
  city: z.string().min(1, "Kota wajib diisi"),
  province: z.string().min(1, "Provinsi wajib diisi"),
  latitude: z.coerce.number().min(-90).max(90).nullable(),
  longitude: z.coerce.number().min(-180).max(180).nullable(),
  traffic_score: z.coerce.number().int().min(0).max(100).nullable(),
  nearby_facilities: z.array(z.string().min(1)).max(30),
})

export async function updatePropertyLocation(
  propertyId: string,
  formData: FormData
): Promise<ActionResult> {
  let facilities: unknown = []
  try {
    facilities = JSON.parse(String(formData.get("nearby_facilities") ?? "[]"))
  } catch {
    facilities = []
  }
  const parsed = LocationSchema.safeParse({
    address: String(formData.get("address") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    province: String(formData.get("province") ?? "").trim(),
    latitude: nullableNumber(formData.get("latitude")),
    longitude: nullableNumber(formData.get("longitude")),
    traffic_score: nullableNumber(formData.get("traffic_score")),
    nearby_facilities: facilities,
  })
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }

  const { supabase, error: authError } = await requireUser()
  if (authError) return { ok: false, error: authError }

  const { error } = await supabase
    .from("properties")
    .update(parsed.data)
    .eq("id", propertyId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(pathFor(propertyId))
  revalidatePath(LIST_PATH)
  return { ok: true }
}
```

- [ ] **Step 2: Create `location-section.tsx`**

```tsx
"use client"

import { useState, useTransition } from "react"
import { ExternalLink, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updatePropertyLocation } from "../actions"

export type PropertyLocation = {
  address: string
  city: string
  province: string
  latitude: number | null
  longitude: number | null
  traffic_score: number | null
  nearby_facilities: string[]
}

export function LocationSection({
  propertyId,
  location,
}: {
  propertyId: string
  location: PropertyLocation
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const [facilities, setFacilities] = useState<string[]>(location.nearby_facilities)
  const [facilityInput, setFacilityInput] = useState("")
  const [lat, setLat] = useState(location.latitude?.toString() ?? "")
  const [lng, setLng] = useState(location.longitude?.toString() ?? "")

  function addFacility() {
    const v = facilityInput.trim()
    if (!v || facilities.includes(v)) {
      setFacilityInput("")
      return
    }
    setFacilities([...facilities, v])
    setFacilityInput("")
  }

  function removeFacility(v: string) {
    setFacilities(facilities.filter((f) => f !== v))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const formData = new FormData(e.currentTarget)
    formData.set("nearby_facilities", JSON.stringify(facilities))
    startTransition(async () => {
      const res = await updatePropertyLocation(propertyId, formData)
      if (res.ok === false) setError(res.error)
      else setSaved(true)
    })
  }

  const mapsUrl =
    lat.trim() && lng.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${lat.trim()},${lng.trim()}`
      : null

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <div className="space-y-4">
        <h3 className="font-semibold">Alamat</h3>
        <div className="space-y-2">
          <Label htmlFor="address">Alamat Lengkap</Label>
          <Textarea
            id="address"
            name="address"
            defaultValue={location.address}
            rows={2}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="city">Kota</Label>
            <Input id="city" name="city" defaultValue={location.city} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="province">Provinsi</Label>
            <Input
              id="province"
              name="province"
              defaultValue={location.province}
              required
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Koordinat & Traffic</h3>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary flex items-center gap-1 text-sm hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Buka di Google Maps
            </a>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="latitude">Latitude</Label>
            <Input
              id="latitude"
              name="latitude"
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="-6.2088"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="longitude">Longitude</Label>
            <Input
              id="longitude"
              name="longitude"
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="106.8456"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="traffic_score">Skor Keramaian (0–100)</Label>
            <Input
              id="traffic_score"
              name="traffic_score"
              type="number"
              min={0}
              max={100}
              defaultValue={location.traffic_score ?? ""}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">Fasilitas Sekitar</h3>
        <div className="flex gap-2">
          <Input
            value={facilityInput}
            onChange={(e) => setFacilityInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addFacility()
              }
            }}
            placeholder="mis. Alfamart, Bank BCA"
          />
          <Button type="button" variant="secondary" onClick={addFacility}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {facilities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {facilities.map((f) => (
              <Badge key={f} variant="secondary" className="gap-1">
                {f}
                <button
                  type="button"
                  aria-label={`Hapus ${f}`}
                  onClick={() => removeFacility(f)}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
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

- [ ] **Step 3: Wire the Lokasi tab in `page.tsx`**

Add the import:

```tsx
import { LocationSection, type PropertyLocation } from "./_components/location-section"
```

Replace the `location` `TabsContent` placeholder with:

```tsx
<TabsContent value="location">
  <LocationSection
    propertyId={id}
    location={
      {
        address: property.address,
        city: property.city,
        province: property.province,
        latitude: property.latitude ?? null,
        longitude: property.longitude ?? null,
        traffic_score: property.traffic_score ?? null,
        nearby_facilities: property.nearby_facilities ?? [],
      } satisfies PropertyLocation
    }
  />
</TabsContent>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Manual smoke**

On the detail page → Lokasi tab: edit address/city, add lat `-6.2088` + lng `106.8456` → "Buka di Google Maps" link appears and opens the right spot. Add two facilities, remove one, Save → reload shows the persisted facilities.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/dashboard/config/properties/[id]
git commit -m "feat(admin): property detail — lokasi (alamat, GPS, fasilitas)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Galeri section

**Files:**

- Modify: `apps/admin/src/app/dashboard/config/properties/[id]/actions.ts`
- Create: `apps/admin/src/app/dashboard/config/properties/[id]/_components/gallery-section.tsx`
- Modify: `apps/admin/src/app/dashboard/config/properties/[id]/page.tsx`

**Interfaces:**

- Consumes: `ActionResult`, `pathFor`, `requireUser`, `revalidatePath`, `LIST_PATH` (Task 4).
- Produces: `updatePropertyGallery(propertyId: string, urls: string[]): Promise<ActionResult>`.

- [ ] **Step 1: Add `updatePropertyGallery` to `[id]/actions.ts`**

Append to `[id]/actions.ts`:

```ts
// -- Galeri ------------------------------------------------------------------

const GallerySchema = z.array(z.string().url("URL gambar tidak valid")).max(10)

export async function updatePropertyGallery(
  propertyId: string,
  urls: string[]
): Promise<ActionResult> {
  const parsed = GallerySchema.safeParse(urls)
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }

  const { supabase, error: authError } = await requireUser()
  if (authError) return { ok: false, error: authError }

  const { error } = await supabase
    .from("properties")
    .update({ gallery_urls: parsed.data })
    .eq("id", propertyId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(pathFor(propertyId))
  revalidatePath(LIST_PATH)
  return { ok: true }
}
```

- [ ] **Step 2: Create `gallery-section.tsx`**

```tsx
"use client"

import { useState, useTransition } from "react"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updatePropertyGallery } from "../actions"

const MAX = 10

export function GallerySection({
  propertyId,
  urls,
}: {
  propertyId: string
  urls: string[]
}) {
  const [items, setItems] = useState<string[]>(urls)
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function persist(next: string[]) {
    setError(null)
    const prev = items
    setItems(next)
    startTransition(async () => {
      const res = await updatePropertyGallery(propertyId, next)
      if (res.ok === false) {
        setError(res.error)
        setItems(prev)
      }
    })
  }

  function add() {
    const v = input.trim()
    if (!v) return
    if (items.length >= MAX) {
      setError(`Maksimal ${MAX} gambar`)
      return
    }
    if (items.includes(v)) {
      setInput("")
      return
    }
    setInput("")
    persist([...items, v])
  }

  function remove(i: number) {
    persist(items.filter((_, idx) => idx !== i))
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    persist(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          Galeri Foto ({items.length}/{MAX})
        </h3>
      </div>

      <div className="flex gap-2">
        <Input
          type="url"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
          placeholder="https://...supabase.co/storage/.../foto.jpg"
          disabled={pending || items.length >= MAX}
        />
        <Button type="button" onClick={add} disabled={pending || items.length >= MAX}>
          <Plus className="mr-2 h-4 w-4" />
          Tambah
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {items.length === 0 ? (
        <div className="text-muted-foreground border-border flex h-40 items-center justify-center rounded-xl border-2 border-dashed text-sm">
          Belum ada foto
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((url, i) => (
            <div
              key={url}
              className="border-border group overflow-hidden rounded-lg border"
            >
              <div className="bg-secondary relative aspect-video">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center justify-between gap-1 p-2">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Naik"
                    disabled={pending || i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Turun"
                    disabled={pending || i === items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Hapus"
                  disabled={pending}
                  onClick={() => remove(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

Note: uses a plain `<img>` (with the eslint-disable already used by `media-section.tsx`) to avoid `next/image` domain constraints for arbitrary URLs during editing.

- [ ] **Step 3: Wire the Galeri tab in `page.tsx`**

Add the import:

```tsx
import { GallerySection } from "./_components/gallery-section"
```

Replace the `gallery` `TabsContent` placeholder with:

```tsx
<TabsContent value="gallery">
  <GallerySection propertyId={id} urls={property.gallery_urls ?? []} />
</TabsContent>
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: both PASS.

- [ ] **Step 5: Manual smoke**

Detail page → Galeri tab: paste an image URL → thumbnail appears and count increments; reorder with up/down; delete one; reload → order/contents persisted. Adding an 11th URL is blocked with "Maksimal 10 gambar". Bad (non-URL) input shows the validation error and reverts.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/dashboard/config/properties/[id]
git commit -m "feat(admin): property detail — galeri foto (URL list)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** migration (Task 1) ↔ spec §1; types (Task 2) ↔ §2; list/create rent-sale (Task 3) ↔ §3; detail page + Spek (Task 4) ↔ §4 + §5 (`updatePropertySpec`, `deletePropertyDetail`); Lokasi (Task 5) ↔ §4 Lokasi + §5 (`updatePropertyLocation`); Galeri (Task 6) ↔ §4 Galeri + §5 (`updatePropertyGallery`). Google Maps link (§5 location handling) in Task 5. All covered.
- **Type consistency:** `ActionResult`, `pathFor`, `firstError`, `nullableNumber`, `nullableText`, `requireUser`, `LIST_PATH` are all defined in Task 4 Step 1 and consumed by Tasks 5–6. Action names match between sections and the actions file (`updatePropertySpec`, `updatePropertyLocation`, `updatePropertyGallery`, `deletePropertyDetail`). `PropertyRow` (Task 3) and `PropertySpec`/`PropertyLocation` (Tasks 4–5) field names match the Task 2 schema and the SQL column names in Task 1.
- **Sentinel:** shadcn `Select` forbids empty-string values; `NONE` sentinel handles optional selects (Task 4) and is mapped back to `""`/`null` before/at the action.
- **No placeholders:** every code step contains full code; the Task 4 page intentionally shows temporary "Task 5/6" stubs that Tasks 5 and 6 replace — these are real, compiling JSX, not TODOs.
