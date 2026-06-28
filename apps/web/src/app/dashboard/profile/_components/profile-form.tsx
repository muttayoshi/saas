"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { UpdateProfileSchema, type Profile } from "@app/types"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"

function str(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim()
  return s === "" ? null : s
}

export function ProfileForm({ initialData }: { initialData: Profile }) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setServerError(null)
    setSuccess(false)
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const supabase = createClient()

    try {
      const raw = {
        full_name: String(fd.get("full_name") ?? "").trim(),
        phone: str(fd.get("phone")),
        company_name: str(fd.get("company_name")),
        city: str(fd.get("city")),
        province: str(fd.get("province")),
        bio: str(fd.get("bio")),
      }
      const parsed = UpdateProfileSchema.safeParse(raw)
      if (!parsed.success) {
        throw new Error(parsed.error.errors[0]?.message ?? "Data profil tidak valid.")
      }
      const { error } = await supabase
        .from("profiles")
        .update(parsed.data)
        .eq("id", initialData.id)
      if (error) throw error

      setSuccess(true)
      router.refresh()
    } catch (err: unknown) {
      setServerError(
        err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {serverError && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {serverError}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-500">
          Profil berhasil diperbarui.
        </div>
      )}

      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">Data Diri</h2>
        <div className="space-y-2">
          <Label htmlFor="full_name">Nama Lengkap *</Label>
          <Input
            id="full_name"
            name="full_name"
            defaultValue={initialData.full_name ?? ""}
            required
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Nomor Telepon</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={initialData.phone ?? ""}
              placeholder="0812..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company_name">Perusahaan</Label>
            <Input
              id="company_name"
              name="company_name"
              defaultValue={initialData.company_name ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Kota</Label>
            <Input id="city" name="city" defaultValue={initialData.city ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="province">Provinsi</Label>
            <Input
              id="province"
              name="province"
              defaultValue={initialData.province ?? ""}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <textarea
            id="bio"
            name="bio"
            defaultValue={initialData.bio ?? ""}
            rows={3}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="gold" type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menyimpan...
            </>
          ) : (
            "Simpan Profil"
          )}
        </Button>
      </div>
    </form>
  )
}
