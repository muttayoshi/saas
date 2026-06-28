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
