# Subscription & Billing (Midtrans)

**Date:** 2026-06-28
**App scope:** `supabase/migrations/` (one new migration), `@app/types` (new `subscription` schemas), `apps/web` (dashboard subscription page, checkout server action, Midtrans webhook + lib, tier gating helpers), `apps/admin` (plan CRUD + read-only subscriptions/payments view).

## Goal

Add a revenue-generating subscription feature. Plans are **admin-configurable** (dynamic, not hardcoded) and include a **Free** tier. After paying through **Midtrans**, a user gains a higher access **tier** that future menus can gate on. Billing is **manual renewal** (pay per period) now, architected so Midtrans auto-recurring can be layered on later.

Deliver the whole feature (DB + types + web + admin) as one design, broken into sequential, self-contained implementation tasks.

## Decisions (from brainstorming)

- **Billing model: hybrid → manual renewal first.** User pays for one period (monthly or yearly) via Midtrans Snap; access is active until `current_period_end`, then they must pay again. Works with every Indonesian payment method (QRIS, GoPay, VA bank, cards). The `subscriptions` table is shaped so Midtrans' Subscription API (auto-recurring) can drive it later without a redesign.
- **Access gating = numeric tier level.** Each plan has a `tier_level` (Free = 0, higher = more access). Higher tiers are a superset of lower ones. Future menus check "minimum tier X" — no per-feature entitlement flags.
- **Each plan carries both a monthly and a yearly price.** User picks the duration at checkout (yearly typically discounted). Not separate plan rows per duration.
- **Free is the default and the floor.** Every new user is effectively Free (tier 0). A paid subscription that expires (or is never renewed) drops the user back to Free automatically — there is never a "no access" state. A **Free plan row is seeded** at migration time so every user maps to a real plan.
- **Expiry is computed by date, not by a cron job.** Effective tier = the plan tier of a subscription where `status='active' AND current_period_end > now()`, else 0. No scheduled job is required for correctness (a tidy-up job to flip stale rows to `expired` is out of scope — YAGNI).
- **Midtrans Snap, not Core API.** Hosted popup/redirect handles all payment methods, PCI, and UI. We call the Snap API server-side with `fetch` (HTTP Basic auth) — **no `midtrans-client` npm dependency** (avoids the `allowBuilds` install-script gate; Snap + signature verification are minimal code).
- **Webhook notification is the source of truth; redirect is never trusted to grant access.** On the return page we additionally do a server-side **status reconcile** against Midtrans' status API — both a dev workaround (no public webhook URL in the sandbox-without-tunnel setup) and a permanent production safety net.

## Midtrans environment

Sandbox keys are available; **no public tunnel** in dev. Therefore:

- The webhook route is built and verified via a **manual/unit signed POST**, not a live Midtrans call in dev.
- The Snap flow is tested in the browser; the return page's **status reconcile** settles the payment when the webhook can't reach localhost.

New env vars (added to `.env.example`):

| var                               | notes                                            |
| --------------------------------- | ------------------------------------------------ |
| `MIDTRANS_SERVER_KEY`             | server-side, Snap + status API basic auth        |
| `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | browser `snap.js`                                |
| `MIDTRANS_IS_PRODUCTION`          | default `false` (sandbox); switches API base URL |
| `SUPABASE_SERVICE_ROLE_KEY`       | webhook writes (bypasses RLS, server-to-server)  |

Base URLs: sandbox `https://app.sandbox.midtrans.com/snap/v1/transactions` + `https://api.sandbox.midtrans.com/v2/{order_id}/status`; production swaps `app`/`api` to non-sandbox hosts.

## Data model

Migration `003_subscriptions.sql` — three enums, three tables, indexes, `current_tier()` helper, RLS, seeded Free plan, `update_updated_at` triggers (reusing the existing function from migration 001). Runs in its own transaction, recorded in `schema_migrations`.

### Enums (Postgres + `@app/types`)

- `billing_period`: `monthly` | `yearly`. Labels: Bulanan / Tahunan (id), Monthly / Yearly (en).
- `subscription_status`: `active` | `expired` | `pending` | `cancelled`.
- `payment_status`: `pending` | `paid` | `failed` | `expired`.

### `subscription_plans` (admin-configurable)

| column                             | type                          | notes                          |
| ---------------------------------- | ----------------------------- | ------------------------------ |
| `id`                               | UUID PK `gen_random_uuid()`   |                                |
| `slug`                             | TEXT UNIQUE NOT NULL          | e.g. `free`, `basic`, `pro`    |
| `name_id`, `name_en`               | TEXT NOT NULL                 | bilingual                      |
| `description_id`, `description_en` | TEXT                          | nullable                       |
| `tier_level`                       | INT NOT NULL UNIQUE           | 0 = Free; higher = more access |
| `price_monthly`, `price_yearly`    | BIGINT NOT NULL DEFAULT 0     | IDR integer; 0 for Free        |
| `features_id`, `features_en`       | TEXT[] NOT NULL DEFAULT '{}'  | pricing-card bullet points     |
| `is_active`                        | BOOLEAN NOT NULL DEFAULT true |                                |
| `sort_order`                       | INT NOT NULL DEFAULT 0        |                                |
| `created_at`, `updated_at`         | TIMESTAMPTZ                   | + `update_updated_at` trigger  |

Indexes on `is_active`, `sort_order`, `tier_level`. **Seed:** one Free row — `slug='free'`, `tier_level=0`, prices 0.

### `subscriptions` (one active record per user)

| column                                       | type                                                      | notes     |
| -------------------------------------------- | --------------------------------------------------------- | --------- |
| `id`                                         | UUID PK                                                   |           |
| `user_id`                                    | UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE |           |
| `plan_id`                                    | UUID NOT NULL REFERENCES subscription_plans(id)           |           |
| `billing_period`                             | billing_period NOT NULL                                   |           |
| `status`                                     | subscription_status NOT NULL DEFAULT 'active'             |           |
| `current_period_start`, `current_period_end` | TIMESTAMPTZ NOT NULL                                      |           |
| `created_at`, `updated_at`                   | TIMESTAMPTZ                                               | + trigger |

**Partial unique index:** `UNIQUE (user_id) WHERE status = 'active'` — at most one active subscription per user. On renewal we **extend `current_period_end`** on the existing active row rather than inserting a new one. Index on `current_period_end` for expiry queries.

### `payments` (every Midtrans order; history + audit)

| column                                    | type                                                      | notes                                        |
| ----------------------------------------- | --------------------------------------------------------- | -------------------------------------------- |
| `id`                                      | UUID PK                                                   |                                              |
| `order_id`                                | TEXT UNIQUE NOT NULL                                      | sent to Midtrans, e.g. `sub-<short-uuid>`    |
| `user_id`                                 | UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE |                                              |
| `plan_id`                                 | UUID NOT NULL REFERENCES subscription_plans(id)           | snapshot of purchase                         |
| `billing_period`                          | billing_period NOT NULL                                   |                                              |
| `amount`                                  | BIGINT NOT NULL                                           | IDR                                          |
| `status`                                  | payment_status NOT NULL DEFAULT 'pending'                 |                                              |
| `midtrans_transaction_id`, `payment_type` | TEXT                                                      | nullable, set on settlement                  |
| `raw_notification`                        | JSONB                                                     | nullable; full webhook payload for debugging |
| `created_at`, `updated_at`                | TIMESTAMPTZ                                               | + trigger                                    |

Index on `user_id`, `status`.

### `current_tier()` helper

SECURITY DEFINER SQL function mirroring `is_admin()`:

```sql
SELECT COALESCE(
  (SELECT p.tier_level FROM subscriptions s
     JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.user_id = auth.uid()
      AND s.status = 'active'
      AND s.current_period_end > now()
    ORDER BY p.tier_level DESC LIMIT 1),
  0);
```

Available to future RLS policies and gating.

### RLS

- `subscription_plans`: public `SELECT` where `is_active` (web pricing list); full access via `is_admin()`.
- `subscriptions`: `SELECT` own (`user_id = auth.uid()`); full access via `is_admin()`. Writes happen through the **service-role** client in the webhook (bypasses RLS).
- `payments`: `SELECT` own; full access via `is_admin()`. Writes via service role.

## Types (`packages/types/src/subscription.ts`)

Zod-first, exported from `index.ts`:

- `BillingPeriodSchema`, `SubscriptionStatusSchema`, `PaymentStatusSchema` (z.enum) + label maps (`BillingPeriodLabels`, etc., id-first).
- `PlanSchema` (+ `CreatePlanSchema`, `UpdatePlanSchema` = pick/partial), `SubscriptionSchema`, `PaymentSchema`.
- All money fields as IDR integers (`z.number().int().nonnegative()`).

## Web (`apps/web`)

### Midtrans lib (`src/lib/midtrans/`)

- `client.ts` (server-only): `createSnapTransaction({ orderId, amount, customer, itemName })` → returns `{ token, redirect_url }`; `getTransactionStatus(orderId)`; base URL chosen by `MIDTRANS_IS_PRODUCTION`. HTTP Basic auth from `MIDTRANS_SERVER_KEY`.
- `verifySignature(payload)`: `sha512(order_id + status_code + gross_amount + serverKey)` compare.

### Service-role Supabase client (`src/lib/supabase/service.ts`)

`createClient` with `SUPABASE_SERVICE_ROLE_KEY`, no cookies — used only by the webhook.

### Tier gating helpers (`src/lib/subscription/`)

- `getCurrentSubscription(userId)` → active subscription + plan, else the Free plan.
- `getCurrentTier(userId)` → number (0 = Free).
- `requireTier(level)` → Server Component helper; redirects to `/dashboard/subscription` if tier too low. **This is the one-liner future menus call.**

### Checkout server action

`createSubscriptionPayment(planId, period)`: validate plan is active and paid (tier > 0), compute amount, insert `payments` row (`pending`, generated `order_id`), call Snap, return `{ token }` to the client.

### Pages / components

- `dashboard/subscription/page.tsx` — current plan + status + days remaining; plan cards with monthly/yearly toggle; upgrade/renew CTAs.
- `dashboard/subscription/_components/plan-cards.tsx` (client) — Snap popup via `snap.js`.
- `dashboard/subscription/_components/subscription-status.tsx`.
- Return handling: `?order_id=...` triggers a server-side **status reconcile** that updates the payment/subscription if the webhook hasn't arrived.
- `api/midtrans/notification/route.ts` — webhook: verify signature → look up payment by `order_id` → on `settlement`/`capture` mark `paid` + upsert/extend the active subscription; on `expire`/`deny`/`cancel` mark `failed`/`expired`. Stores `raw_notification`. Uses the service-role client.
- Dashboard sidebar gets a **"Langganan"** link.

### Next.js 16 specifics

- **Exclude `/api/midtrans/notification` from the auth guard in `apps/web/src/proxy.ts`** — Midtrans sends no cookie; the guard would otherwise redirect it to `/login`.
- `cookies()`/`headers()` remain `await`-ed per existing convention.

## Admin (`apps/admin`)

- `dashboard/plans/page.tsx` + server actions (`create`/`update`/`remove` returning `ActionResult`) — plan CRUD. Plans have more fields than `LookupCrud` supports (two prices, tier, feature arrays), so a dedicated `_components/plan-form.tsx` in the same visual style (glass cards, dialog form).
- `dashboard/subscriptions/page.tsx` — **read-only** list: who is subscribed (user, plan, period, status, expiry) + recent payments. Admin can see subscription data but not edit subscriptions directly.
- Admin sidebar gets **"Paket Langganan"** and **"Langganan"** links.
- Admin already gates on `profile.role === 'admin'`; admin RLS access is via `is_admin()`.

## Out of scope (YAGNI)

- Auto-recurring billing (Midtrans Subscription API) — table shape leaves the door open.
- Per-feature entitlement flags (tier level only).
- Scheduled job to flip expired rows (date-computed instead).
- Proration / mid-period plan changes / refunds.
- Coupons / discounts beyond the yearly price field.
- Invoices/receipts PDF, email notifications.

## Implementation order (sequential, self-contained)

1. Migration `003_subscriptions.sql` (enums, tables, `current_tier()`, RLS, seed Free) — `pnpm db:migrate`.
2. `@app/types` subscription schemas + labels.
3. Midtrans lib + service-role client + `.env.example` vars.
4. Tier gating helpers.
5. Checkout server action + webhook route + proxy exclusion.
6. Web `dashboard/subscription` page + components + sidebar link + return reconcile.
7. Admin plan CRUD page + form + server actions + sidebar link.
8. Admin read-only subscriptions/payments view + sidebar link.
