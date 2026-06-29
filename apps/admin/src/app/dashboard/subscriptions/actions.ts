"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { BillingPeriod } from "@app/types"

export type ActionResult = { ok: true } | { ok: false; error: string }

const PATH = "/dashboard/subscriptions"

// Local copy of the web app's period helper (admin can't import from @app/web).
function addPeriod(from: Date, period: BillingPeriod): Date {
  const d = new Date(from.getTime())
  if (period === "monthly") d.setUTCMonth(d.getUTCMonth() + 1)
  else d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d
}

// Admin manually confirms a pending payment: mark it paid, then extend the user's
// active subscription (from max(now, current end)) or create a new active one.
// Runs on the admin client — RLS `is_admin()` grants full access to payments +
// subscriptions, so no service-role key is needed.
export async function confirmPayment(paymentId: string): Promise<ActionResult> {
  const supabase = await createClient()

  // Atomic claim: only a still-pending payment transitions to paid. A second
  // confirm (or a race with the Midtrans webhook) finds no pending row → no-op.
  const { data: claimed, error: claimErr } = await supabase
    .from("payments")
    .update({ status: "paid", payment_type: "manual" })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("user_id, plan_id, billing_period")
    .maybeSingle()
  if (claimErr) return { ok: false, error: claimErr.message }
  if (!claimed)
    return { ok: false, error: "Pembayaran tidak ditemukan atau sudah diproses." }

  const payment = claimed as {
    user_id: string
    plan_id: string
    billing_period: BillingPeriod
  }

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, current_period_end")
    .eq("user_id", payment.user_id)
    .eq("status", "active")
    .maybeSingle()

  const now = new Date()
  if (existing) {
    const base =
      new Date(existing.current_period_end) > now
        ? new Date(existing.current_period_end)
        : now
    const { error } = await supabase
      .from("subscriptions")
      .update({
        plan_id: payment.plan_id,
        billing_period: payment.billing_period,
        current_period_end: addPeriod(base, payment.billing_period).toISOString(),
      })
      .eq("id", existing.id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase.from("subscriptions").insert({
      user_id: payment.user_id,
      plan_id: payment.plan_id,
      billing_period: payment.billing_period,
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: addPeriod(now, payment.billing_period).toISOString(),
    })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath(PATH)
  return { ok: true }
}

// Admin rejects a pending payment. Subscription untouched.
export async function rejectPayment(paymentId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("payments")
    .update({ status: "failed" })
    .eq("id", paymentId)
    .eq("status", "pending")
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}
