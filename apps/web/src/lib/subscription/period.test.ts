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
