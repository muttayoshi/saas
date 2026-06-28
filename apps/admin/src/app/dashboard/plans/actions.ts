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
