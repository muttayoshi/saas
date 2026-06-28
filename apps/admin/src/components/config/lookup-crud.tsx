"use client"

import { useState, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { List, Pencil, Plus, Trash2 } from "lucide-react"

export type LookupRow = {
  id: string
  slug: string
  name_id: string
  name_en: string
  sort_order: number
  is_active: boolean
  [key: string]: unknown
}

export type LookupField = {
  name: string
  label: string
  type?: "text" | "number"
  placeholder?: string
  required?: boolean
}

export type ActionResult = { ok: true } | { ok: false; error: string }

export type LookupActions = {
  create: (formData: FormData) => Promise<ActionResult>
  update: (id: string, formData: FormData) => Promise<ActionResult>
  remove: (id: string) => Promise<ActionResult>
}

// Fields common to every lookup; pages pass `extraFields` (e.g. cities' code/province).
const BASE_FIELDS: LookupField[] = [
  { name: "slug", label: "Slug", placeholder: "jakarta", required: true },
  { name: "name_id", label: "Nama (ID)", placeholder: "Jakarta", required: true },
  { name: "name_en", label: "Nama (EN)", placeholder: "Jakarta", required: true },
]

function FormDialog({
  mode,
  row,
  fields,
  actions,
  trigger,
}: {
  mode: "create" | "edit"
  row?: LookupRow
  fields: LookupField[]
  actions: LookupActions
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res =
        mode === "create"
          ? await actions.create(formData)
          : await actions.update(row!.id, formData)
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Tambah" : "Edit"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {fields.map((f) => (
            <div key={f.name} className="space-y-2">
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input
                id={f.name}
                name={f.name}
                type={f.type ?? "text"}
                defaultValue={(row?.[f.name] as string | number | undefined) ?? ""}
                placeholder={f.placeholder}
                required={f.required}
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="sort_order">Urutan</Label>
            <Input
              id="sort_order"
              name="sort_order"
              type="number"
              min={0}
              defaultValue={row?.sort_order ?? 0}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={row?.is_active ?? true}
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

export function LookupCrud({
  title,
  description,
  rows,
  actions,
  extraFields = [],
  extraColumns = [],
}: {
  title: string
  description: string
  rows: LookupRow[]
  actions: LookupActions
  extraFields?: LookupField[]
  // Extra read-only columns shown in the table, e.g. [{ key: "province", label: "Provinsi" }]
  extraColumns?: { key: string; label: string }[]
}) {
  const fields = [...BASE_FIELDS, ...extraFields]
  const [pending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function onDelete(r: LookupRow) {
    if (!confirm(`Hapus "${r.name_id}"?`)) return
    setDeletingId(r.id)
    startTransition(async () => {
      const res = await actions.remove(r.id)
      if (res.ok === false) alert(res.error)
      setDeletingId(null)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
        <FormDialog
          mode="create"
          fields={fields}
          actions={actions}
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
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-muted-foreground border-border flex h-48 items-center justify-center rounded-xl border-2 border-dashed text-sm">
              Belum ada data
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-left">
                    <th className="px-3 py-3 font-medium">Urutan</th>
                    <th className="px-3 py-3 font-medium">Slug</th>
                    <th className="px-3 py-3 font-medium">Nama (ID)</th>
                    <th className="px-3 py-3 font-medium">Nama (EN)</th>
                    {extraColumns.map((c) => (
                      <th key={c.key} className="px-3 py-3 font-medium">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-border/50 hover:bg-secondary/50 border-b transition-colors"
                    >
                      <td className="text-muted-foreground px-3 py-3">{r.sort_order}</td>
                      <td className="px-3 py-3 font-mono text-xs">{r.slug}</td>
                      <td className="px-3 py-3 font-medium">{r.name_id}</td>
                      <td className="text-muted-foreground px-3 py-3">{r.name_en}</td>
                      {extraColumns.map((c) => (
                        <td key={c.key} className="text-muted-foreground px-3 py-3">
                          {(r[c.key] as string) ?? "—"}
                        </td>
                      ))}
                      <td className="px-3 py-3">
                        <Badge variant={r.is_active ? "default" : "outline"}>
                          {r.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <FormDialog
                            mode="edit"
                            row={r}
                            fields={fields}
                            actions={actions}
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
                            disabled={deletingId === r.id}
                            onClick={() => onDelete(r)}
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
