"use client"

import { useRouter } from "next/navigation"
import { UserRoleSchema, UserRoleLabels } from "@app/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const ROLES = UserRoleSchema.options

export function UserFilters({ q, role }: { q: string; role: string }) {
  const router = useRouter()

  function apply(form: FormData) {
    const params = new URLSearchParams()
    const next = {
      q: String(form.get("q") ?? "").trim(),
      role: String(form.get("role") ?? ""),
    }
    if (next.q) params.set("q", next.q)
    if (next.role) params.set("role", next.role)
    router.push(`/dashboard/users${params.toString() ? `?${params}` : ""}`)
  }

  return (
    <form action={apply} className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1">
        <Input name="q" defaultValue={q} placeholder="Cari nama, email, atau HP" />
      </div>
      <select
        name="role"
        defaultValue={role}
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      >
        <option value="">Semua role</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {UserRoleLabels[r].id}
          </option>
        ))}
      </select>
      <Button type="submit">Filter</Button>
    </form>
  )
}
