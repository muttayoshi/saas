# Subscription & Billing (Midtrans) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-configurable subscription plans (incl. a Free tier) that users buy via Midtrans Snap to unlock higher access tiers, with admin able to view all subscription/payment data.

**Architecture:** Three new Postgres tables (`subscription_plans`, `subscriptions`, `payments`) + a `current_tier()` SQL helper drive a numeric tier-gating model. The web app creates a Snap transaction server-side, the browser opens the Snap popup, and a Midtrans webhook (verified by signature, written via the Supabase service-role client) is the source of truth for activating a subscription; the return page also reconciles status against Midtrans' status API. Plans are managed in the admin app.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), Supabase (Postgres + Auth + RLS, `@supabase/ssr`), Zod (`@app/types`), Midtrans Snap (raw `fetch`, no SDK), Turborepo + pnpm.

## Global Constraints

- Next.js 16: middleware in `web` is `apps/web/src/proxy.ts` (not `middleware.ts`); `cookies()`/`headers()` are async — always `await`.
- Node >= 22, pnpm >= 11. Run all commands from repo root unless noted.
- **No test runner is configured.** Pure functions are tested with Node's built-in runner: `node --test path/to/file.test.ts` (Node 22 strips TS types natively). Everything else is verified with `pnpm typecheck`, `pnpm lint` (web only), `pnpm db:migrate`, and explicit manual steps.
- Money is IDR integer (no decimals) everywhere.
- Bilingual: Indonesian (`id`) is default/primary; provide `_id` and `_en` fields and id-first label maps.
- Domain types live in `@app/types` (Zod schema + inferred type); never redefine shapes locally.
- Server actions return `type ActionResult = { ok: true } | { ok: false; error: string }`.
- No new dependency with an install script (the `allowBuilds` gate) — Midtrans is plain `fetch`.
- Migrations: one numbered `.sql` file per migration, self-contained, idempotent where practical; applied by `pnpm db:migrate` (reads `DIRECT_URL`).
- **Single public Midtrans env flag** `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION` is used by BOTH server (API base URL) and client (snap.js URL). This replaces the spec's `MIDTRANS_IS_PRODUCTION` to avoid two flags. The production boolean is not secret; the server key stays server-only.

---

### Task 1: Migration `003_subscriptions.sql`

**Files:**

- Create: `supabase/migrations/003_subscriptions.sql`

**Interfaces:**

- Produces (DB objects later tasks rely on): tables `subscription_plans`, `subscriptions`, `payments`; enums `billing_period`, `subscription_status`, `payment_status`; function `public.current_tier()` returns `int`; a seeded Free plan row (`slug='free'`, `tier_level=0`).

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/003_subscriptions.sql`:

```sql
-- =============================================================================
-- Migration 003: Subscription plans, subscriptions, payments (Midtrans)
-- =============================================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE billing_period AS ENUM ('monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('active', 'expired', 'pending', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Plans (admin-configurable)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT NOT NULL UNIQUE,
  name_id        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  description_id TEXT,
  description_en TEXT,
  tier_level     INT NOT NULL UNIQUE,
  price_monthly  BIGINT NOT NULL DEFAULT 0,
  price_yearly   BIGINT NOT NULL DEFAULT 0,
  features_id    TEXT[] NOT NULL DEFAULT '{}',
  features_en    TEXT[] NOT NULL DEFAULT '{}',
  is_active      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plans_active     ON subscription_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_plans_sort       ON subscription_plans(sort_order);
CREATE INDEX IF NOT EXISTS idx_plans_tier       ON subscription_plans(tier_level);

DROP TRIGGER IF EXISTS plans_updated_at ON subscription_plans;
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Subscriptions (one active per user)
CREATE TABLE IF NOT EXISTS subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id              UUID NOT NULL REFERENCES subscription_plans(id),
  billing_period       billing_period NOT NULL,
  status               subscription_status NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end   TIMESTAMPTZ NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_one_active
  ON subscriptions(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end  ON subscriptions(current_period_end);

DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Payments (every Midtrans order)
CREATE TABLE IF NOT EXISTS payments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                TEXT NOT NULL UNIQUE,
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                 UUID NOT NULL REFERENCES subscription_plans(id),
  billing_period          billing_period NOT NULL,
  amount                  BIGINT NOT NULL,
  status                  payment_status NOT NULL DEFAULT 'pending',
  midtrans_transaction_id TEXT,
  payment_type            TEXT,
  raw_notification        JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_user   ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Effective tier for the current user (0 = Free). Mirrors public.is_admin().
CREATE OR REPLACE FUNCTION public.current_tier()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT p.tier_level
       FROM subscriptions s
       JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.current_period_end > now()
      ORDER BY p.tier_level DESC
      LIMIT 1),
    0);
$$;

-- Row Level Security
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_select_active ON subscription_plans;
CREATE POLICY plans_select_active ON subscription_plans
  FOR SELECT USING (is_active OR public.is_admin());

DROP POLICY IF EXISTS plans_admin_all ON subscription_plans;
CREATE POLICY plans_admin_all ON subscription_plans
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS subscriptions_select_own ON subscriptions;
CREATE POLICY subscriptions_select_own ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS subscriptions_admin_all ON subscriptions;
CREATE POLICY subscriptions_admin_all ON subscriptions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS payments_select_own ON payments;
CREATE POLICY payments_select_own ON payments
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS payments_admin_all ON payments;
CREATE POLICY payments_admin_all ON payments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed the Free plan (tier 0). Idempotent.
INSERT INTO subscription_plans (slug, name_id, name_en, description_id, description_en, tier_level, price_monthly, price_yearly, features_id, features_en, sort_order)
VALUES ('free', 'Gratis', 'Free', 'Akses dasar tanpa biaya', 'Basic access at no cost', 0, 0, 0,
        ARRAY['Akses fitur dasar'], ARRAY['Basic features'], 0)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE subscription_plans IS 'Admin-configurable subscription tiers (tier_level 0 = Free)';
COMMENT ON TABLE subscriptions IS 'User subscriptions; at most one active per user';
COMMENT ON TABLE payments IS 'Midtrans payment orders (history + audit)';
```

Note: `update_updated_at()`, `gen_random_uuid()` (pgcrypto), and `public.is_admin()` already exist from migration 001.

- [ ] **Step 2: Apply the migration**

Run: `pnpm db:migrate`
Expected: output shows `003_subscriptions.sql` applied (and records it in `schema_migrations`); no SQL errors.

- [ ] **Step 3: Verify schema + seed**

Run: `node --env-file=.env.local -e "import('pg').then(async({default:pg})=>{const c=new pg.Client(process.env.DIRECT_URL);await c.connect();const a=await c.query(\"select slug,tier_level,price_monthly from subscription_plans\");console.log('plans:',a.rows);const t=await c.query('select public.current_tier()');console.log('current_tier (no auth):',t.rows);await c.end()})"`
Expected: `plans:` includes the `free` row with `tier_level: 0`; `current_tier` returns `0` (no `auth.uid()` in this context).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/003_subscriptions.sql
git commit -m "feat(db): subscription plans, subscriptions, payments + current_tier()"
```

---

### Task 2: Domain types (`@app/types`)

**Files:**

- Create: `packages/types/src/subscription.ts`
- Create: `packages/types/src/subscription.test.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `BillingPeriodSchema`/`BillingPeriod`, `SubscriptionStatusSchema`/`SubscriptionStatus`, `PaymentStatusSchema`/`PaymentStatus`, `PlanSchema`/`Plan`, `CreatePlanSchema`/`CreatePlan`, `UpdatePlanSchema`/`UpdatePlan`, `SubscriptionSchema`/`Subscription`, `PaymentSchema`/`Payment`, label maps `BillingPeriodLabels`, `SubscriptionStatusLabels`, `PaymentStatusLabels`.

- [ ] **Step 1: Write the failing test**

Create `packages/types/src/subscription.test.ts`:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  PlanSchema,
  CreatePlanSchema,
  BillingPeriodSchema,
  BillingPeriodLabels,
} from "./subscription.ts"

test("BillingPeriodSchema accepts monthly/yearly and rejects others", () => {
  assert.equal(BillingPeriodSchema.parse("monthly"), "monthly")
  assert.equal(BillingPeriodSchema.parse("yearly"), "yearly")
  assert.equal(BillingPeriodSchema.safeParse("weekly").success, false)
})

test("BillingPeriodLabels are id-first bilingual", () => {
  assert.equal(BillingPeriodLabels.monthly.id, "Bulanan")
  assert.equal(BillingPeriodLabels.yearly.en, "Yearly")
})

test("CreatePlanSchema requires names + tier and rejects negative price", () => {
  const ok = CreatePlanSchema.safeParse({
    slug: "pro",
    name_id: "Pro",
    name_en: "Pro",
    tier_level: 2,
    price_monthly: 99000,
    price_yearly: 990000,
    features_id: ["A"],
    features_en: ["A"],
    is_active: true,
    sort_order: 2,
  })
  assert.equal(ok.success, true)
  const bad = CreatePlanSchema.safeParse({
    slug: "pro",
    name_id: "Pro",
    name_en: "Pro",
    tier_level: 2,
    price_monthly: -1,
    price_yearly: 0,
  })
  assert.equal(bad.success, false)
})

test("PlanSchema parses a full DB row", () => {
  const row = {
    id: "00000000-0000-0000-0000-000000000000",
    slug: "free",
    name_id: "Gratis",
    name_en: "Free",
    description_id: null,
    description_en: null,
    tier_level: 0,
    price_monthly: 0,
    price_yearly: 0,
    features_id: [],
    features_en: [],
    is_active: true,
    sort_order: 0,
    created_at: "2026-06-28T00:00:00.000Z",
    updated_at: "2026-06-28T00:00:00.000Z",
  }
  assert.equal(PlanSchema.parse(row).slug, "free")
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/types/src/subscription.test.ts`
Expected: FAIL — cannot find module `./subscription.ts`.

- [ ] **Step 3: Implement `subscription.ts`**

Create `packages/types/src/subscription.ts`:

```ts
import { z } from "zod"

export const BillingPeriodSchema = z.enum(["monthly", "yearly"])
export type BillingPeriod = z.infer<typeof BillingPeriodSchema>
export const BillingPeriodLabels: Record<BillingPeriod, { id: string; en: string }> = {
  monthly: { id: "Bulanan", en: "Monthly" },
  yearly: { id: "Tahunan", en: "Yearly" },
}

export const SubscriptionStatusSchema = z.enum([
  "active",
  "expired",
  "pending",
  "cancelled",
])
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>
export const SubscriptionStatusLabels: Record<
  SubscriptionStatus,
  { id: string; en: string }
> = {
  active: { id: "Aktif", en: "Active" },
  expired: { id: "Kedaluwarsa", en: "Expired" },
  pending: { id: "Menunggu", en: "Pending" },
  cancelled: { id: "Dibatalkan", en: "Cancelled" },
}

export const PaymentStatusSchema = z.enum(["pending", "paid", "failed", "expired"])
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>
export const PaymentStatusLabels: Record<PaymentStatus, { id: string; en: string }> = {
  pending: { id: "Menunggu", en: "Pending" },
  paid: { id: "Lunas", en: "Paid" },
  failed: { id: "Gagal", en: "Failed" },
  expired: { id: "Kedaluwarsa", en: "Expired" },
}

const money = z.number().int().nonnegative()

export const PlanSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(50),
  name_id: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  description_id: z.string().max(500).nullable(),
  description_en: z.string().max(500).nullable(),
  tier_level: z.number().int().nonnegative(),
  price_monthly: money,
  price_yearly: money,
  features_id: z.array(z.string()),
  features_en: z.array(z.string()),
  is_active: z.boolean(),
  sort_order: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type Plan = z.infer<typeof PlanSchema>

export const CreatePlanSchema = z.object({
  slug: z.string().min(1, "Slug wajib diisi").max(50),
  name_id: z.string().min(1, "Nama (ID) wajib diisi").max(100),
  name_en: z.string().min(1, "Nama (EN) wajib diisi").max(100),
  description_id: z.string().max(500).nullable().optional(),
  description_en: z.string().max(500).nullable().optional(),
  tier_level: z.number().int().nonnegative(),
  price_monthly: money,
  price_yearly: money,
  features_id: z.array(z.string()).default([]),
  features_en: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
})
export type CreatePlan = z.infer<typeof CreatePlanSchema>

export const UpdatePlanSchema = CreatePlanSchema.partial()
export type UpdatePlan = z.infer<typeof UpdatePlanSchema>

export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  billing_period: BillingPeriodSchema,
  status: SubscriptionStatusSchema,
  current_period_start: z.string().datetime(),
  current_period_end: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type Subscription = z.infer<typeof SubscriptionSchema>

export const PaymentSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string(),
  user_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  billing_period: BillingPeriodSchema,
  amount: money,
  status: PaymentStatusSchema,
  midtrans_transaction_id: z.string().nullable(),
  payment_type: z.string().nullable(),
  raw_notification: z.unknown().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type Payment = z.infer<typeof PaymentSchema>
```

- [ ] **Step 4: Export from the package index**

Modify `packages/types/src/index.ts` — add after the existing exports:

```ts
export * from "./subscription"
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test packages/types/src/subscription.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/subscription.ts packages/types/src/subscription.test.ts packages/types/src/index.ts
git commit -m "feat(types): subscription, plan & payment schemas"
```

---

### Task 3: Midtrans lib, service-role client, env vars

**Files:**

- Create: `apps/web/src/lib/midtrans/signature.ts`
- Create: `apps/web/src/lib/midtrans/signature.test.ts`
- Create: `apps/web/src/lib/midtrans/client.ts`
- Create: `apps/web/src/lib/supabase/service.ts`
- Modify: `.env.example`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `verifyMidtransSignature(input: { order_id: string; status_code: string; gross_amount: string; signature_key: string }, serverKey: string): boolean`
  - `createSnapTransaction(params: { orderId: string; amount: number; itemName: string; customer: { name: string; email: string } }): Promise<{ token: string; redirect_url: string }>`
  - `getMidtransStatus(orderId: string): Promise<{ transaction_status: string; transaction_id?: string; payment_type?: string; status_code: string; gross_amount: string; signature_key?: string }>`
  - `createServiceClient(): SupabaseClient` (service-role, no cookies)

- [ ] **Step 1: Write the failing signature test**

Create `apps/web/src/lib/midtrans/signature.test.ts`:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { verifyMidtransSignature } from "./signature.ts"

const serverKey = "SB-Mid-server-TEST"
const order_id = "sub-abc123"
const status_code = "200"
const gross_amount = "99000.00"
const valid = createHash("sha512")
  .update(order_id + status_code + gross_amount + serverKey)
  .digest("hex")

test("accepts a correct signature", () => {
  assert.equal(
    verifyMidtransSignature(
      { order_id, status_code, gross_amount, signature_key: valid },
      serverKey
    ),
    true
  )
})

test("rejects a tampered signature", () => {
  assert.equal(
    verifyMidtransSignature(
      { order_id, status_code, gross_amount, signature_key: "deadbeef" },
      serverKey
    ),
    false
  )
})

test("rejects when amount differs", () => {
  assert.equal(
    verifyMidtransSignature(
      { order_id, status_code, gross_amount: "1.00", signature_key: valid },
      serverKey
    ),
    false
  )
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test apps/web/src/lib/midtrans/signature.test.ts`
Expected: FAIL — cannot find `./signature.ts`.

- [ ] **Step 3: Implement `signature.ts`**

Create `apps/web/src/lib/midtrans/signature.ts`:

```ts
import { createHash, timingSafeEqual } from "node:crypto"

// Midtrans notification signature: sha512(order_id + status_code + gross_amount + serverKey)
export function verifyMidtransSignature(
  input: {
    order_id: string
    status_code: string
    gross_amount: string
    signature_key: string
  },
  serverKey: string
): boolean {
  const expected = createHash("sha512")
    .update(input.order_id + input.status_code + input.gross_amount + serverKey)
    .digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(input.signature_key)
  return a.length === b.length && timingSafeEqual(a, b)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test apps/web/src/lib/midtrans/signature.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the Snap/status client**

Create `apps/web/src/lib/midtrans/client.ts`:

```ts
import "server-only"

const IS_PROD = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true"
const SNAP_BASE = IS_PROD
  ? "https://app.midtrans.com/snap/v1/transactions"
  : "https://app.sandbox.midtrans.com/snap/v1/transactions"
const API_BASE = IS_PROD ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com"

function authHeader() {
  const key = process.env.MIDTRANS_SERVER_KEY
  if (!key) throw new Error("MIDTRANS_SERVER_KEY is not set")
  return "Basic " + Buffer.from(key + ":").toString("base64")
}

export async function createSnapTransaction(params: {
  orderId: string
  amount: number
  itemName: string
  customer: { name: string; email: string }
}): Promise<{ token: string; redirect_url: string }> {
  const res = await fetch(SNAP_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      transaction_details: { order_id: params.orderId, gross_amount: params.amount },
      item_details: [
        {
          id: params.orderId,
          price: params.amount,
          quantity: 1,
          name: params.itemName.slice(0, 50),
        },
      ],
      customer_details: {
        first_name: params.customer.name,
        email: params.customer.email,
      },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Midtrans Snap error ${res.status}: ${body}`)
  }
  return res.json()
}

export async function getMidtransStatus(orderId: string): Promise<{
  transaction_status: string
  transaction_id?: string
  payment_type?: string
  status_code: string
  gross_amount: string
  signature_key?: string
}> {
  const res = await fetch(`${API_BASE}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Accept: "application/json", Authorization: authHeader() },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Midtrans status error ${res.status}: ${body}`)
  }
  return res.json()
}
```

- [ ] **Step 6: Implement the service-role Supabase client**

Create `apps/web/src/lib/supabase/service.ts`:

```ts
import "server-only"
import { createClient } from "@supabase/supabase-js"

// Service-role client for server-to-server writes (webhook). Bypasses RLS — never expose to the browser.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase service env vars are not set")
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

Note: `@supabase/supabase-js` is already a transitive dep of `@supabase/ssr`, but verify it resolves in `apps/web` (Step 8). If `pnpm typecheck` reports it missing, run `pnpm --filter @app/web add @supabase/supabase-js` (no install script — safe).

- [ ] **Step 7: Add env vars to `.env.example`**

Modify `.env.example` — add a new block before the `# App` section:

```bash
# Midtrans (payment gateway)
MIDTRANS_SERVER_KEY=SB-Mid-server-your_key_here
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=SB-Mid-client-your_key_here
NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=false

# Supabase service role (server-only; webhook writes — bypasses RLS)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (If `@supabase/supabase-js` is unresolved, run the add command in Step 6's note, then re-run.)

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/midtrans apps/web/src/lib/supabase/service.ts .env.example
git commit -m "feat(web): midtrans snap/status client, signature verify, service-role client"
```

---

### Task 4: Tier gating helpers

**Files:**

- Create: `apps/web/src/lib/subscription/period.ts`
- Create: `apps/web/src/lib/subscription/period.test.ts`
- Create: `apps/web/src/lib/subscription/access.ts`

**Interfaces:**

- Consumes: `createClient` from `@/lib/supabase/server`; `Plan`, `Subscription`, `BillingPeriod` from `@app/types`.
- Produces:
  - `addPeriod(from: Date, period: BillingPeriod): Date`
  - `planAmount(plan: Plan, period: BillingPeriod): number`
  - `getCurrentSubscription(userId: string): Promise<{ plan: Plan; subscription: Subscription | null }>` (subscription is null when the user is on Free)
  - `getCurrentTier(userId: string): Promise<number>`
  - `requireTier(level: number): Promise<void>` (redirects to `/dashboard/subscription` when tier too low)

- [ ] **Step 1: Write the failing test for the pure helpers**

Create `apps/web/src/lib/subscription/period.test.ts`:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { addPeriod, planAmount } from "./period.ts"

test("addPeriod adds one month", () => {
  const d = addPeriod(new Date("2026-01-15T00:00:00.000Z"), "monthly")
  assert.equal(d.toISOString(), "2026-02-15T00:00:00.000Z")
})

test("addPeriod adds one year", () => {
  const d = addPeriod(new Date("2026-01-15T00:00:00.000Z"), "yearly")
  assert.equal(d.toISOString(), "2027-01-15T00:00:00.000Z")
})

test("planAmount picks the matching price", () => {
  const plan = { price_monthly: 99000, price_yearly: 990000 } as never
  assert.equal(planAmount(plan, "monthly"), 99000)
  assert.equal(planAmount(plan, "yearly"), 990000)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test apps/web/src/lib/subscription/period.test.ts`
Expected: FAIL — cannot find `./period.ts`.

- [ ] **Step 3: Implement `period.ts`**

Create `apps/web/src/lib/subscription/period.ts`:

```ts
import type { BillingPeriod, Plan } from "@app/types"

// Add one billing period to a date (UTC-safe; setUTCMonth handles year rollover).
export function addPeriod(from: Date, period: BillingPeriod): Date {
  const d = new Date(from.getTime())
  if (period === "monthly") d.setUTCMonth(d.getUTCMonth() + 1)
  else d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d
}

export function planAmount(
  plan: Pick<Plan, "price_monthly" | "price_yearly">,
  period: BillingPeriod
): number {
  return period === "monthly" ? plan.price_monthly : plan.price_yearly
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test apps/web/src/lib/subscription/period.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `access.ts`**

Create `apps/web/src/lib/subscription/access.ts`:

```ts
import "server-only"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Plan, Subscription } from "@app/types"

// The user's active subscription + its plan, or the Free plan when none is active.
export async function getCurrentSubscription(
  userId: string
): Promise<{ plan: Plan; subscription: Subscription | null }> {
  const supabase = await createClient()

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*, plan:subscription_plans(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("current_period_end", new Date().toISOString())
    .maybeSingle()

  if (sub && sub.plan) {
    const { plan, ...subscription } = sub as unknown as Subscription & { plan: Plan }
    return { plan, subscription }
  }

  const { data: free } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("slug", "free")
    .single()

  return { plan: free as unknown as Plan, subscription: null }
}

export async function getCurrentTier(userId: string): Promise<number> {
  const { plan } = await getCurrentSubscription(userId)
  return plan?.tier_level ?? 0
}

// Guard for future gated routes: call at the top of a Server Component page/layout.
export async function requireTier(level: number): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const tier = await getCurrentTier(user.id)
  if (tier < level) redirect("/dashboard/subscription")
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/subscription
git commit -m "feat(web): tier gating helpers (getCurrentSubscription, getCurrentTier, requireTier)"
```

---

### Task 5: Checkout server action, webhook route, proxy exclusion

**Files:**

- Create: `apps/web/src/app/dashboard/subscription/actions.ts`
- Create: `apps/web/src/app/api/midtrans/notification/route.ts`
- Modify: `apps/web/src/proxy.ts`

**Interfaces:**

- Consumes: `createSnapTransaction`, `getMidtransStatus` from `@/lib/midtrans/client`; `verifyMidtransSignature` from `@/lib/midtrans/signature`; `createServiceClient` from `@/lib/supabase/service`; `createClient` from `@/lib/supabase/server`; `addPeriod`, `planAmount` from `@/lib/subscription/period`; `BillingPeriodSchema` from `@app/types`.
- Produces:
  - `createSubscriptionPayment(planId: string, period: BillingPeriod): Promise<{ ok: true; token: string; orderId: string } | { ok: false; error: string }>`
  - `reconcilePayment(orderId: string): Promise<void>` (re-exported helper used by the page in Task 6; activates the subscription if Midtrans reports settlement)
  - Webhook `POST /api/midtrans/notification` returning `200 { ok: true }` on accepted notifications.

- [ ] **Step 1: Implement the shared settlement helper + checkout action**

Create `apps/web/src/app/dashboard/subscription/actions.ts`:

```ts
"use server"

import { randomUUID } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { createSnapTransaction, getMidtransStatus } from "@/lib/midtrans/client"
import { addPeriod, planAmount } from "@/lib/subscription/period"
import { BillingPeriodSchema, type BillingPeriod } from "@app/types"

type CheckoutResult =
  | { ok: true; token: string; orderId: string }
  | { ok: false; error: string }

export async function createSubscriptionPayment(
  planId: string,
  period: BillingPeriod
): Promise<CheckoutResult> {
  const periodParse = BillingPeriodSchema.safeParse(period)
  if (!periodParse.success) return { ok: false, error: "Periode tidak valid." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Anda harus masuk terlebih dahulu." }

  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("id", planId)
    .eq("is_active", true)
    .single()
  if (!plan) return { ok: false, error: "Paket tidak ditemukan." }
  if (plan.tier_level <= 0)
    return { ok: false, error: "Paket gratis tidak perlu pembayaran." }

  const amount = planAmount(plan, periodParse.data)
  if (amount <= 0) return { ok: false, error: "Harga paket belum diatur." }

  const orderId = `sub-${randomUUID().slice(0, 8)}-${Date.now().toString(36)}`

  // Record the pending order with the service client (RLS-safe, server-trusted snapshot).
  const admin = createServiceClient()
  const { error: insErr } = await admin.from("payments").insert({
    order_id: orderId,
    user_id: user.id,
    plan_id: plan.id,
    billing_period: periodParse.data,
    amount,
    status: "pending",
  })
  if (insErr) return { ok: false, error: "Gagal membuat pesanan." }

  try {
    const { token } = await createSnapTransaction({
      orderId,
      amount,
      itemName: `${plan.name_id} (${periodParse.data})`,
      customer: {
        name: user.user_metadata?.full_name ?? user.email ?? "User",
        email: user.email ?? "",
      },
    })
    return { ok: true, token, orderId }
  } catch {
    await admin.from("payments").update({ status: "failed" }).eq("order_id", orderId)
    return { ok: false, error: "Gagal menghubungi Midtrans." }
  }
}

// Source-of-truth settlement, shared by the webhook and the return-page reconcile.
// Marks the payment paid/failed and extends/creates the active subscription on success.
export async function settleOrder(input: {
  orderId: string
  transactionStatus: string
  transactionId?: string
  paymentType?: string
  rawNotification?: unknown
}): Promise<void> {
  const admin = createServiceClient()
  const { data: payment } = await admin
    .from("payments")
    .select("*")
    .eq("order_id", input.orderId)
    .single()
  if (!payment) return
  if (payment.status === "paid") return // idempotent

  const settled =
    input.transactionStatus === "settlement" || input.transactionStatus === "capture"
  const failed = ["deny", "cancel", "expire", "failure"].includes(input.transactionStatus)

  if (settled) {
    await admin
      .from("payments")
      .update({
        status: "paid",
        midtrans_transaction_id: input.transactionId ?? null,
        payment_type: input.paymentType ?? null,
        raw_notification: input.rawNotification ?? null,
      })
      .eq("order_id", input.orderId)

    // Extend the active subscription if not expired, else start fresh from now.
    const { data: existing } = await admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", payment.user_id)
      .eq("status", "active")
      .maybeSingle()

    const now = new Date()
    if (existing) {
      const base =
        new Date(existing.current_period_end) > now
          ? new Date(existing.current_period_end)
          : now
      await admin
        .from("subscriptions")
        .update({
          plan_id: payment.plan_id,
          billing_period: payment.billing_period,
          current_period_end: addPeriod(base, payment.billing_period).toISOString(),
        })
        .eq("id", existing.id)
    } else {
      await admin.from("subscriptions").insert({
        user_id: payment.user_id,
        plan_id: payment.plan_id,
        billing_period: payment.billing_period,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: addPeriod(now, payment.billing_period).toISOString(),
      })
    }
  } else if (failed) {
    await admin
      .from("payments")
      .update({
        status: input.transactionStatus === "expire" ? "expired" : "failed",
        raw_notification: input.rawNotification ?? null,
      })
      .eq("order_id", input.orderId)
  }
}

// Used by the return page: pull authoritative status from Midtrans and settle.
export async function reconcilePayment(orderId: string): Promise<void> {
  try {
    const s = await getMidtransStatus(orderId)
    await settleOrder({
      orderId,
      transactionStatus: s.transaction_status,
      transactionId: s.transaction_id,
      paymentType: s.payment_type,
      rawNotification: s,
    })
  } catch {
    // status not available yet — leave pending
  }
}
```

- [ ] **Step 2: Implement the webhook route**

Create `apps/web/src/app/api/midtrans/notification/route.ts`:

```ts
import { NextResponse } from "next/server"
import { verifyMidtransSignature } from "@/lib/midtrans/signature"
import { settleOrder } from "@/app/dashboard/subscription/actions"

export async function POST(request: Request) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY
  if (!serverKey) return NextResponse.json({ ok: false }, { status: 500 })

  let body: {
    order_id?: string
    status_code?: string
    gross_amount?: string
    signature_key?: string
    transaction_status?: string
    transaction_id?: string
    payment_type?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 })
  }

  const { order_id, status_code, gross_amount, signature_key, transaction_status } = body
  if (
    !order_id ||
    !status_code ||
    !gross_amount ||
    !signature_key ||
    !transaction_status
  ) {
    return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 })
  }

  if (
    !verifyMidtransSignature(
      { order_id, status_code, gross_amount, signature_key },
      serverKey
    )
  ) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 403 })
  }

  await settleOrder({
    orderId: order_id,
    transactionStatus: transaction_status,
    transactionId: body.transaction_id,
    paymentType: body.payment_type,
    rawNotification: body,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Exclude the webhook from the proxy/session matcher**

Modify `apps/web/src/proxy.ts` — replace the `matcher` entry so API routes (the webhook) skip the session middleware:

```ts
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
```

(The auth guard in `middleware.ts` only redirects `/dashboard`, but excluding `api` avoids running session refresh on the cookie-less webhook.)

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm --filter @app/web lint`
Expected: no errors.

- [ ] **Step 5: Manually verify the webhook signature gate**

Start the web app: `pnpm --filter @app/web dev` (separate terminal). Then send an unsigned and a wrongly-signed POST:

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/midtrans/notification -H 'Content-Type: application/json' -d '{"order_id":"x","status_code":"200","gross_amount":"1.00","signature_key":"wrong","transaction_status":"settlement"}'`
Expected: `403` (invalid signature). A missing-field body returns `400`. This confirms the route is reachable (not redirected to login) and the signature gate works.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/subscription/actions.ts apps/web/src/app/api/midtrans/notification/route.ts apps/web/src/proxy.ts
git commit -m "feat(web): subscription checkout action, midtrans webhook, settlement + reconcile"
```

---

### Task 6: Web subscription page, plan cards, return reconcile, navbar link

**Files:**

- Create: `apps/web/src/app/dashboard/subscription/page.tsx`
- Create: `apps/web/src/app/dashboard/subscription/_components/plan-cards.tsx`
- Create: `apps/web/src/app/dashboard/subscription/_components/subscription-status.tsx`
- Modify: `apps/web/src/components/layout/navbar.tsx`

**Interfaces:**

- Consumes: `createClient` from `@/lib/supabase/server`; `getCurrentSubscription` from `@/lib/subscription/access`; `reconcilePayment`, `createSubscriptionPayment` from the actions file; `Plan`, `Subscription`, `BillingPeriodLabels` from `@app/types`.
- Produces: route `/dashboard/subscription`.

- [ ] **Step 1: Implement the status component**

Create `apps/web/src/app/dashboard/subscription/_components/subscription-status.tsx`:

```tsx
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CreditCard } from "lucide-react"
import type { Plan, Subscription } from "@app/types"

export function SubscriptionStatus({
  plan,
  subscription,
}: {
  plan: Plan
  subscription: Subscription | null
}) {
  const daysLeft = subscription
    ? Math.max(
        0,
        Math.ceil(
          (new Date(subscription.current_period_end).getTime() - Date.now()) / 86_400_000
        )
      )
    : null

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Paket Anda Saat Ini
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">{plan.name_id}</span>
          <Badge variant={subscription ? "default" : "outline"}>
            {subscription ? "Aktif" : "Gratis"}
          </Badge>
        </div>
        {subscription && (
          <p className="text-muted-foreground text-sm">
            Berlaku sampai{" "}
            {new Date(subscription.current_period_end).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            · {daysLeft} hari lagi
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Implement the plan cards (client, Snap popup)**

Create `apps/web/src/app/dashboard/subscription/_components/plan-cards.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import Script from "next/script"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Check } from "lucide-react"
import { createSubscriptionPayment } from "../actions"
import type { Plan, BillingPeriod } from "@app/types"

const SNAP_URL =
  process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true"
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js"

type SnapWindow = Window & {
  snap?: { pay: (token: string, opts: Record<string, (r?: unknown) => void>) => void }
}

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n)
}

export function PlanCards({
  plans,
  currentPlanId,
}: {
  plans: Plan[]
  currentPlanId: string
}) {
  const router = useRouter()
  const [period, setPeriod] = useState<BillingPeriod>("monthly")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function subscribe(planId: string) {
    setError(null)
    startTransition(async () => {
      const res = await createSubscriptionPayment(planId, period)
      if (!res.ok) {
        setError(res.error)
        return
      }
      const snap = (window as SnapWindow).snap
      if (!snap) {
        setError("Gagal memuat Midtrans. Muat ulang halaman.")
        return
      }
      const back = () => router.push(`/dashboard/subscription?order_id=${res.orderId}`)
      snap.pay(res.token, {
        onSuccess: back,
        onPending: back,
        onClose: () => {},
        onError: () => setError("Pembayaran gagal."),
      })
    })
  }

  return (
    <div className="space-y-4">
      <Script
        src={SNAP_URL}
        data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
        strategy="afterInteractive"
      />

      <div className="border-border inline-flex rounded-lg border p-1">
        {(["monthly", "yearly"] as BillingPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              period === p
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            {p === "monthly" ? "Bulanan" : "Tahunan"}
          </button>
        ))}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = period === "monthly" ? plan.price_monthly : plan.price_yearly
          const isCurrent = plan.id === currentPlanId
          const isFree = plan.tier_level <= 0
          return (
            <Card key={plan.id} className="glass flex flex-col">
              <CardHeader>
                <CardTitle>{plan.name_id}</CardTitle>
                <p className="text-2xl font-bold">{isFree ? "Gratis" : rupiah(price)}</p>
                {!isFree && (
                  <p className="text-muted-foreground text-xs">
                    per {period === "monthly" ? "bulan" : "tahun"}
                  </p>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <ul className="flex-1 space-y-2 text-sm">
                  {plan.features_id.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="text-primary mt-0.5 h-4 w-4" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  disabled={isCurrent || isFree || pending}
                  onClick={() => subscribe(plan.id)}
                >
                  {isCurrent
                    ? "Paket Aktif"
                    : isFree
                      ? "Gratis"
                      : pending
                        ? "Memproses..."
                        : "Berlangganan"}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Implement the page (with return reconcile)**

Create `apps/web/src/app/dashboard/subscription/page.tsx`:

```tsx
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCurrentSubscription } from "@/lib/subscription/access"
import { reconcilePayment } from "./actions"
import { SubscriptionStatus } from "./_components/subscription-status"
import { PlanCards } from "./_components/plan-cards"
import type { Plan } from "@app/types"

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?redirectTo=/dashboard/subscription")

  // Returning from Snap: reconcile against Midtrans before reading current state.
  const sp = await searchParams
  if (sp.order_id) await reconcilePayment(sp.order_id)

  const { plan, subscription } = await getCurrentSubscription(user.id)

  const { data: plansData } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
  const plans = (plansData ?? []) as unknown as Plan[]

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Langganan</h1>
        <p className="text-muted-foreground mt-1">Kelola paket langganan Anda</p>
      </div>

      <SubscriptionStatus plan={plan} subscription={subscription} />
      <PlanCards plans={plans} currentPlanId={plan.id} />
    </main>
  )
}
```

- [ ] **Step 4: Add the navbar dropdown link**

Modify `apps/web/src/components/layout/navbar.tsx`:

1. Add `CreditCard` to the `lucide-react` import:

```tsx
import { LogOut, User, LayoutDashboard, ChevronDown, CreditCard } from "lucide-react"
```

2. Add a menu item after the "Profil Saya" `DropdownMenuItem`:

```tsx
<DropdownMenuItem asChild>
  <Link href="/dashboard/subscription" className="gap-2">
    <CreditCard className="h-4 w-4" />
    Langganan
  </Link>
</DropdownMenuItem>
```

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm --filter @app/web lint`
Expected: no errors.

- [ ] **Step 6: Manual browser check (with sandbox keys in `.env.local`)**

With `MIDTRANS_SERVER_KEY`, `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`, `SUPABASE_SERVICE_ROLE_KEY` set in `.env.local` and `pnpm --filter @app/web dev` running:

1. Log in, open `http://localhost:3000/dashboard/subscription`.
2. Confirm the current plan shows **Gratis**, plan cards render, monthly/yearly toggle changes prices.
3. Click "Berlangganan" on a paid plan → Snap popup opens. Pay with a sandbox method (e.g. test VA / simulator).
4. On return, the page reconciles; the status card flips to the paid plan with an expiry date.
   Expected: subscription becomes active; a `payments` row is `paid` and a `subscriptions` row is `active`. (If a paid plan does not yet exist, create one in Task 7 first, or temporarily insert one via SQL.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/subscription apps/web/src/components/layout/navbar.tsx
git commit -m "feat(web): subscription dashboard page, plan cards (Snap), status, navbar link"
```

---

### Task 7: Admin plan CRUD

**Files:**

- Create: `apps/admin/src/app/dashboard/plans/page.tsx`
- Create: `apps/admin/src/app/dashboard/plans/actions.ts`
- Create: `apps/admin/src/app/dashboard/plans/_components/plans-manager.tsx`
- Modify: `apps/admin/src/components/layout/sidebar-nav.tsx`

**Interfaces:**

- Consumes: `createClient` from `@/lib/supabase/server`; `CreatePlanSchema`, `UpdatePlanSchema`, `Plan` from `@app/types`.
- Produces:
  - `createPlan(formData: FormData): Promise<ActionResult>`
  - `updatePlan(id: string, formData: FormData): Promise<ActionResult>`
  - `removePlan(id: string): Promise<ActionResult>`
  - route `/dashboard/plans`.

- [ ] **Step 1: Implement the server actions**

Create `apps/admin/src/app/dashboard/plans/actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { CreatePlanSchema, UpdatePlanSchema } from "@app/types"

export type ActionResult = { ok: true } | { ok: false; error: string }

const PATH = "/dashboard/plans"

// Parse the shared form shape. Features are newline-separated textareas.
function parseForm(formData: FormData) {
  const lines = (v: FormDataEntryValue | null) =>
    String(v ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
  const num = (v: FormDataEntryValue | null) => Number(String(v ?? "0").trim() || "0")
  const nullable = (v: FormDataEntryValue | null) => {
    const s = String(v ?? "").trim()
    return s === "" ? null : s
  }
  return {
    slug: String(formData.get("slug") ?? "").trim(),
    name_id: String(formData.get("name_id") ?? "").trim(),
    name_en: String(formData.get("name_en") ?? "").trim(),
    description_id: nullable(formData.get("description_id")),
    description_en: nullable(formData.get("description_en")),
    tier_level: num(formData.get("tier_level")),
    price_monthly: num(formData.get("price_monthly")),
    price_yearly: num(formData.get("price_yearly")),
    features_id: lines(formData.get("features_id")),
    features_en: lines(formData.get("features_en")),
    is_active: formData.get("is_active") === "on",
    sort_order: num(formData.get("sort_order")),
  }
}

export async function createPlan(formData: FormData): Promise<ActionResult> {
  const parsed = CreatePlanSchema.safeParse(parseForm(formData))
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Data tidak valid." }
  }
  const supabase = await createClient()
  const { error } = await supabase.from("subscription_plans").insert(parsed.data)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

export async function updatePlan(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = UpdatePlanSchema.safeParse(parseForm(formData))
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Data tidak valid." }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from("subscription_plans")
    .update(parsed.data)
    .eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

export async function removePlan(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from("subscription_plans").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}
```

- [ ] **Step 2: Implement the manager UI (table + dialog form)**

Create `apps/admin/src/app/dashboard/plans/_components/plans-manager.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { List, Pencil, Plus, Trash2 } from "lucide-react"
import type { Plan } from "@app/types"
import { createPlan, updatePlan, removePlan, type ActionResult } from "../actions"

function PlanDialog({
  mode,
  plan,
  trigger,
}: {
  mode: "create" | "edit"
  plan?: Plan
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res: ActionResult =
        mode === "create" ? await createPlan(fd) : await updatePlan(plan!.id, fd)
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Tambah Paket" : "Edit Paket"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field name="slug" label="Slug" defaultValue={plan?.slug} required />
            <Field
              name="tier_level"
              label="Tier (0=Gratis)"
              type="number"
              defaultValue={plan?.tier_level ?? 0}
            />
            <Field
              name="name_id"
              label="Nama (ID)"
              defaultValue={plan?.name_id}
              required
            />
            <Field
              name="name_en"
              label="Nama (EN)"
              defaultValue={plan?.name_en}
              required
            />
            <Field
              name="price_monthly"
              label="Harga Bulanan (Rp)"
              type="number"
              defaultValue={plan?.price_monthly ?? 0}
            />
            <Field
              name="price_yearly"
              label="Harga Tahunan (Rp)"
              type="number"
              defaultValue={plan?.price_yearly ?? 0}
            />
            <Field
              name="sort_order"
              label="Urutan"
              type="number"
              defaultValue={plan?.sort_order ?? 0}
            />
          </div>
          <Field
            name="description_id"
            label="Deskripsi (ID)"
            defaultValue={plan?.description_id ?? ""}
          />
          <Field
            name="description_en"
            label="Deskripsi (EN)"
            defaultValue={plan?.description_en ?? ""}
          />
          <TextArea
            name="features_id"
            label="Fitur (ID) — satu per baris"
            defaultValue={(plan?.features_id ?? []).join("\n")}
          />
          <TextArea
            name="features_en"
            label="Fitur (EN) — satu per baris"
            defaultValue={(plan?.features_en ?? []).join("\n")}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={plan?.is_active ?? true}
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

function Field({
  name,
  label,
  type = "text",
  defaultValue,
  required,
}: {
  name: string
  label: string
  type?: string
  defaultValue?: string | number
  required?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
      />
    </div>
  )
}

function TextArea({
  name,
  label,
  defaultValue,
}: {
  name: string
  label: string
  defaultValue?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <textarea
        id={name}
        name={name}
        defaultValue={defaultValue}
        rows={3}
        className="border-input bg-background flex w-full rounded-md border px-3 py-2 text-sm"
      />
    </div>
  )
}

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n)
}

export function PlansManager({ plans }: { plans: Plan[] }) {
  const [pending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function onDelete(p: Plan) {
    if (!confirm(`Hapus paket "${p.name_id}"?`)) return
    setDeletingId(p.id)
    startTransition(async () => {
      const res = await removePlan(p.id)
      if (res.ok === false) alert(res.error)
      setDeletingId(null)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Paket Langganan</h1>
          <p className="text-muted-foreground mt-1">Kelola paket & harga langganan</p>
        </div>
        <PlanDialog
          mode="create"
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
            Semua Paket
          </CardTitle>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <div className="text-muted-foreground border-border flex h-48 items-center justify-center rounded-xl border-2 border-dashed text-sm">
              Belum ada paket
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-left">
                    <th className="px-3 py-3 font-medium">Tier</th>
                    <th className="px-3 py-3 font-medium">Nama</th>
                    <th className="px-3 py-3 font-medium">Bulanan</th>
                    <th className="px-3 py-3 font-medium">Tahunan</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr
                      key={p.id}
                      className="border-border/50 hover:bg-secondary/50 border-b transition-colors"
                    >
                      <td className="text-muted-foreground px-3 py-3">{p.tier_level}</td>
                      <td className="px-3 py-3 font-medium">{p.name_id}</td>
                      <td className="px-3 py-3">Rp {rupiah(p.price_monthly)}</td>
                      <td className="px-3 py-3">Rp {rupiah(p.price_yearly)}</td>
                      <td className="px-3 py-3">
                        <Badge variant={p.is_active ? "default" : "outline"}>
                          {p.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <PlanDialog
                            mode="edit"
                            plan={p}
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
                            disabled={deletingId === p.id}
                            onClick={() => onDelete(p)}
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

- [ ] **Step 3: Implement the page**

Create `apps/admin/src/app/dashboard/plans/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server"
import { PlansManager } from "./_components/plans-manager"
import type { Plan } from "@app/types"

export default async function PlansPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("subscription_plans")
    .select("*")
    .order("sort_order", { ascending: true })
  const plans = (data ?? []) as unknown as Plan[]
  return <PlansManager plans={plans} />
}
```

- [ ] **Step 4: Add sidebar links**

Modify `apps/admin/src/components/layout/sidebar-nav.tsx`:

1. Add icons to the import:

```tsx
import { LayoutDashboard, Users, CreditCard, Receipt } from "lucide-react"
```

2. Extend `topItems`:

```tsx
const topItems: NavLeaf[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/users", label: "Pengguna", icon: Users },
  { href: "/dashboard/plans", label: "Paket Langganan", icon: CreditCard },
  { href: "/dashboard/subscriptions", label: "Langganan", icon: Receipt },
]
```

(The `/dashboard/subscriptions` route is built in Task 8; adding the link now is harmless.)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (Admin has no lint script.)

- [ ] **Step 6: Manual check**

With `pnpm --filter @app/admin dev` and an admin account: open `http://localhost:3001/dashboard/plans`. Create a "Pro" plan (tier 2, monthly 99000, yearly 990000, a couple of features). Confirm it appears in the table, edit it, and that it now shows on the web pricing page (`:3000/dashboard/subscription`).
Expected: CRUD works; the new plan is visible to users.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/app/dashboard/plans apps/admin/src/components/layout/sidebar-nav.tsx
git commit -m "feat(admin): subscription plan CRUD + sidebar links"
```

---

### Task 8: Admin read-only subscriptions & payments view

**Files:**

- Create: `apps/admin/src/app/dashboard/subscriptions/page.tsx`
- Create: `apps/admin/src/app/dashboard/subscriptions/_components/subscriptions-table.tsx`
- Create: `apps/admin/src/app/dashboard/subscriptions/_components/payments-table.tsx`

**Interfaces:**

- Consumes: `createClient` from `@/lib/supabase/server`; `SubscriptionStatusLabels`, `PaymentStatusLabels`, `BillingPeriodLabels` from `@app/types`.
- Produces: route `/dashboard/subscriptions` (read-only).

- [ ] **Step 1: Implement the subscriptions table component**

Create `apps/admin/src/app/dashboard/subscriptions/_components/subscriptions-table.tsx`:

```tsx
import { Badge } from "@/components/ui/badge"
import {
  SubscriptionStatusLabels,
  BillingPeriodLabels,
  type SubscriptionStatus,
  type BillingPeriod,
} from "@app/types"

export type SubRow = {
  id: string
  status: SubscriptionStatus
  billing_period: BillingPeriod
  current_period_end: string
  plan: { name_id: string } | null
  user: { full_name: string; email: string } | null
}

export function SubscriptionsTable({ rows }: { rows: SubRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground border-border flex h-32 items-center justify-center rounded-xl border-2 border-dashed text-sm">
        Belum ada langganan
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-left">
            <th className="px-3 py-3 font-medium">Pengguna</th>
            <th className="px-3 py-3 font-medium">Paket</th>
            <th className="px-3 py-3 font-medium">Periode</th>
            <th className="px-3 py-3 font-medium">Berakhir</th>
            <th className="px-3 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-border/50 border-b">
              <td className="px-3 py-3">
                <div className="font-medium">{r.user?.full_name ?? "—"}</div>
                <div className="text-muted-foreground text-xs">{r.user?.email ?? ""}</div>
              </td>
              <td className="px-3 py-3">{r.plan?.name_id ?? "—"}</td>
              <td className="px-3 py-3">{BillingPeriodLabels[r.billing_period].id}</td>
              <td className="px-3 py-3">
                {new Date(r.current_period_end).toLocaleDateString("id-ID")}
              </td>
              <td className="px-3 py-3">
                <Badge variant={r.status === "active" ? "default" : "outline"}>
                  {SubscriptionStatusLabels[r.status].id}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Implement the payments table component**

Create `apps/admin/src/app/dashboard/subscriptions/_components/payments-table.tsx`:

```tsx
import { Badge } from "@/components/ui/badge"
import { PaymentStatusLabels, type PaymentStatus } from "@app/types"

export type PaymentRow = {
  id: string
  order_id: string
  amount: number
  status: PaymentStatus
  created_at: string
  plan: { name_id: string } | null
  user: { email: string } | null
}

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n)
}

export function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground border-border flex h-32 items-center justify-center rounded-xl border-2 border-dashed text-sm">
        Belum ada pembayaran
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-left">
            <th className="px-3 py-3 font-medium">Order ID</th>
            <th className="px-3 py-3 font-medium">Pengguna</th>
            <th className="px-3 py-3 font-medium">Paket</th>
            <th className="px-3 py-3 font-medium">Jumlah</th>
            <th className="px-3 py-3 font-medium">Tanggal</th>
            <th className="px-3 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-border/50 border-b">
              <td className="px-3 py-3 font-mono text-xs">{r.order_id}</td>
              <td className="px-3 py-3">{r.user?.email ?? "—"}</td>
              <td className="px-3 py-3">{r.plan?.name_id ?? "—"}</td>
              <td className="px-3 py-3">Rp {rupiah(r.amount)}</td>
              <td className="px-3 py-3">
                {new Date(r.created_at).toLocaleDateString("id-ID")}
              </td>
              <td className="px-3 py-3">
                <Badge variant={r.status === "paid" ? "default" : "outline"}>
                  {PaymentStatusLabels[r.status].id}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Implement the page**

Create `apps/admin/src/app/dashboard/subscriptions/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CreditCard, Receipt } from "lucide-react"
import { SubscriptionsTable, type SubRow } from "./_components/subscriptions-table"
import { PaymentsTable, type PaymentRow } from "./_components/payments-table"

export default async function SubscriptionsPage() {
  const supabase = await createClient()

  const { data: subsData } = await supabase
    .from("subscriptions")
    .select(
      "id, status, billing_period, current_period_end, plan:subscription_plans(name_id), user:profiles(full_name, email)"
    )
    .order("current_period_end", { ascending: false })

  const { data: payData } = await supabase
    .from("payments")
    .select(
      "id, order_id, amount, status, created_at, plan:subscription_plans(name_id), user:profiles(email)"
    )
    .order("created_at", { ascending: false })
    .limit(50)

  const subs = (subsData ?? []) as unknown as SubRow[]
  const payments = (payData ?? []) as unknown as PaymentRow[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Langganan</h1>
        <p className="text-muted-foreground mt-1">Data langganan & pembayaran pengguna</p>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Langganan Aktif & Riwayat
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SubscriptionsTable rows={subs} />
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Pembayaran Terbaru
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentsTable rows={payments} />
        </CardContent>
      </Card>
    </div>
  )
}
```

Note on the join to `profiles`: `subscriptions.user_id`/`payments.user_id` reference `auth.users(id)`, and `profiles.id` is the same id, but there is no declared FK from these tables to `profiles`, so PostgREST may not auto-embed `user:profiles(...)`. If the embed errors at runtime, add an explicit FK in a follow-up (`ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_profiles_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;` and the same for `payments`) so PostgREST can resolve the relationship; then re-run `pnpm db:migrate` with that change appended as migration `004`. Verify in Step 5.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Manual check**

With `pnpm --filter @app/admin dev` and an admin account, after completing at least one sandbox payment in Task 6: open `http://localhost:3001/dashboard/subscriptions`.
Expected: the active subscription and the paid payment appear with user email, plan, amount, and status. If the page errors on the `user:profiles` embed, apply the FK note above and re-check.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/dashboard/subscriptions
git commit -m "feat(admin): read-only subscriptions & payments view"
```

---

## Self-Review notes

- **Spec coverage:** plans table + admin CRUD (Tasks 1, 7); monthly+yearly prices (Tasks 1, 2, 6, 7); Free seeded + Free-as-floor (Task 1 seed, Task 4 `getCurrentSubscription`); tier gating `current_tier()` + `requireTier` (Tasks 1, 4); Midtrans Snap + signature + service-role + status reconcile (Tasks 3, 5, 6); webhook as source of truth + proxy exclusion (Task 5); admin views subscription data (Task 8); env vars (Task 3). All spec sections map to a task.
- **Env flag deviation:** spec's `MIDTRANS_IS_PRODUCTION` is implemented as the single public `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION` (used by server + client). Documented in Global Constraints.
- **Type consistency:** `settleOrder` (Task 5) is consumed by the webhook (Task 5) and `reconcilePayment` (Task 5); `createSubscriptionPayment` signature matches its caller in `plan-cards.tsx` (Task 6); label maps and types used in Task 8 are produced in Task 2.
- **Known follow-up:** PostgREST embed of `profiles` in Task 8 may need an explicit FK (migration 004) — flagged inline with the exact SQL.

```

```
