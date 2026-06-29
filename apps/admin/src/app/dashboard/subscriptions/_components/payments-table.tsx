import { Badge } from "@/components/ui/badge"
import { PaymentStatusLabels, type PaymentStatus } from "@app/types"
import { PaymentActions } from "./payment-actions"

export type PaymentRow = {
  id: string
  order_id: string
  amount: number
  status: PaymentStatus
  created_at: string
  plan: { name_id: string } | null
  user: { email: string } | null
}

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n)
}

export function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground border-border flex h-32 items-center justify-center rounded-xl border-2 border-dashed text-sm">
        Belum ada pembayaran
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-left">
            <th className="px-3 py-3 font-medium">Order ID</th>
            <th className="px-3 py-3 font-medium">Pengguna</th>
            <th className="px-3 py-3 font-medium">Paket</th>
            <th className="px-3 py-3 font-medium">Jumlah</th>
            <th className="px-3 py-3 font-medium">Tanggal</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 text-right font-medium">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-border/50 border-b">
              <td className="px-3 py-3 font-mono text-xs">{r.order_id}</td>
              <td className="px-3 py-3">{r.user?.email ?? "—"}</td>
              <td className="px-3 py-3">{r.plan?.name_id ?? "—"}</td>
              <td className="px-3 py-3">Rp {rupiah(r.amount)}</td>
              <td className="px-3 py-3">
                {new Date(r.created_at).toLocaleDateString("id-ID")}
              </td>
              <td className="px-3 py-3">
                <Badge variant={r.status === "paid" ? "default" : "outline"}>
                  {PaymentStatusLabels[r.status].id}
                </Badge>
              </td>
              <td className="px-3 py-3 text-right">
                {r.status === "pending" ? (
                  <PaymentActions paymentId={r.id} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
