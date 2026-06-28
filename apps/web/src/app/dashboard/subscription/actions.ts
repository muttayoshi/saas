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
