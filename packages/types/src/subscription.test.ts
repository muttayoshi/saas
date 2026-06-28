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
