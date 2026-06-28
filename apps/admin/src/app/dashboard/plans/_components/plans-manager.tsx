"use client"

import { useState, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { List, Pencil, Plus, Trash2 } from "lucide-react"
import type { Plan } from "@app/types"
import { createPlan, updatePlan, removePlan, type ActionResult } from "../actions"

function PlanDialog({
  mode,
  plan,
  trigger,
}: {
  mode: "create" | "edit"
  plan?: Plan
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res: ActionResult =
        mode === "create" ? await createPlan(fd) : await updatePlan(plan!.id, fd)
      if (res.ok === false) setError(res.error)
      else setOpen(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setError(null)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Tambah Paket" : "Edit Paket"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field name="slug" label="Slug" defaultValue={plan?.slug} required />
            <Field
              name="tier_level"
              label="Tier (0=Gratis)"
              type="number"
              defaultValue={plan?.tier_level ?? 0}
            />
            <Field
              name="name_id"
              label="Nama (ID)"
              defaultValue={plan?.name_id}
              required
            />
            <Field
              name="name_en"
              label="Nama (EN)"
              defaultValue={plan?.name_en}
              required
            />
            <Field
              name="price_monthly"
              label="Harga Bulanan (Rp)"
              type="number"
              defaultValue={plan?.price_monthly ?? 0}
            />
            <Field
              name="price_yearly"
              label="Harga Tahunan (Rp)"
              type="number"
              defaultValue={plan?.price_yearly ?? 0}
            />
            <Field
              name="sort_order"
              label="Urutan"
              type="number"
              defaultValue={plan?.sort_order ?? 0}
            />
          </div>
          <Field
            name="description_id"
            label="Deskripsi (ID)"
            defaultValue={plan?.description_id ?? ""}
          />
          <Field
            name="description_en"
            label="Deskripsi (EN)"
            defaultValue={plan?.description_en ?? ""}
          />
          <TextArea
            name="features_id"
            label="Fitur (ID) — satu per baris"
            defaultValue={(plan?.features_id ?? []).join("\n")}
          />
          <TextArea
            name="features_en"
            label="Fitur (EN) — satu per baris"
            defaultValue={(plan?.features_en ?? []).join("\n")}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={plan?.is_active ?? true}
            />
            Aktif
          </label>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
  required,
}: {
  name: string
  label: string
  type?: string
  defaultValue?: string | number
  required?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
      />
    </div>
  )
}

function TextArea({
  name,
  label,
  defaultValue,
}: {
  name: string
  label: string
  defaultValue?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <textarea
        id={name}
        name={name}
        defaultValue={defaultValue}
        rows={3}
        className="border-input bg-background flex w-full rounded-md border px-3 py-2 text-sm"
      />
    </div>
  )
}

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n)
}

export function PlansManager({ plans }: { plans: Plan[] }) {
  const [pending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function onDelete(p: Plan) {
    if (!confirm(`Hapus paket "${p.name_id}"?`)) return
    setDeletingId(p.id)
    startTransition(async () => {
      const res = await removePlan(p.id)
      if (res.ok === false) alert(res.error)
      setDeletingId(null)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Paket Langganan</h1>
          <p className="text-muted-foreground mt-1">Kelola paket & harga langganan</p>
        </div>
        <PlanDialog
          mode="create"
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Tambah
            </Button>
          }
        />
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Semua Paket
          </CardTitle>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <div className="text-muted-foreground border-border flex h-48 items-center justify-center rounded-xl border-2 border-dashed text-sm">
              Belum ada paket
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-left">
                    <th className="px-3 py-3 font-medium">Tier</th>
                    <th className="px-3 py-3 font-medium">Nama</th>
                    <th className="px-3 py-3 font-medium">Bulanan</th>
                    <th className="px-3 py-3 font-medium">Tahunan</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr
                      key={p.id}
                      className="border-border/50 hover:bg-secondary/50 border-b transition-colors"
                    >
                      <td className="text-muted-foreground px-3 py-3">{p.tier_level}</td>
                      <td className="px-3 py-3 font-medium">{p.name_id}</td>
                      <td className="px-3 py-3">Rp {rupiah(p.price_monthly)}</td>
                      <td className="px-3 py-3">Rp {rupiah(p.price_yearly)}</td>
                      <td className="px-3 py-3">
                        <Badge variant={p.is_active ? "default" : "outline"}>
                          {p.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <PlanDialog
                            mode="edit"
                            plan={p}
                            trigger={
                              <Button variant="ghost" size="icon-sm" aria-label="Edit">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Hapus"
                            disabled={deletingId === p.id}
                            onClick={() => onDelete(p)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
