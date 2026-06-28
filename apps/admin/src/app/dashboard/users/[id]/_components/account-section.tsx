"use client"

import { useState, useTransition } from "react"
import { UserRoleSchema, UserRoleLabels } from "@app/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateAccount, type ActionResult } from "../actions"

const ROLES = UserRoleSchema.options

export type Account = {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: string
  company_name: string | null
  city: string | null
  province: string | null
  bio: string | null
}

export function AccountSection({ account }: { account: Account }) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res: ActionResult = await updateAccount(account.id, formData)
      if (res.ok === false) setError(res.error)
      else setSaved(true)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="full_name">Nama Lengkap</Label>
          <Input
            id="full_name"
            name="full_name"
            defaultValue={account.full_name}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={account.email} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">No. HP</Label>
          <Input id="phone" name="phone" defaultValue={account.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            name="role"
            defaultValue={account.role}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {UserRoleLabels[r].id}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="company_name">Perusahaan</Label>
          <Input
            id="company_name"
            name="company_name"
            defaultValue={account.company_name ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">Kota</Label>
          <Input id="city" name="city" defaultValue={account.city ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="province">Provinsi</Label>
          <Input id="province" name="province" defaultValue={account.province ?? ""} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={account.bio ?? ""}
          rows={3}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="border-border flex items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan Perubahan"}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Tersimpan</span>}
      </div>
    </form>
  )
}
