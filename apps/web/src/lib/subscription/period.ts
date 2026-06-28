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
