"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { UpdateProfileSchema, UserRoleSchema } from "@app/types"

export type ActionResult = { ok: true } | { ok: false; error: string }

function path(id: string) {
  return `/dashboard/users/${id}`
}

function nullable(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim()
  return s === "" ? null : s
}

export async function updateAccount(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const roleParse = UserRoleSchema.safeParse(String(formData.get("role") ?? "").trim())
  if (!roleParse.success) {
    return { ok: false, error: "Role tidak valid." }
  }

  const raw = {
    full_name: String(formData.get("full_name") ?? "").trim(),
    phone: nullable(formData.get("phone")),
    company_name: nullable(formData.get("company_name")),
    city: nullable(formData.get("city")),
    province: nullable(formData.get("province")),
    bio: nullable(formData.get("bio")),
  }
  const parsed = UpdateProfileSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Data tidak valid." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("profiles")
    .update({ ...parsed.data, role: roleParse.data })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(path(id))
  return { ok: true }
}
