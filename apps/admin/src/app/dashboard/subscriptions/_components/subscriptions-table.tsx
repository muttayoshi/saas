import { Badge } from "@/components/ui/badge"
import {
  SubscriptionStatusLabels,
  BillingPeriodLabels,
  type SubscriptionStatus,
  type BillingPeriod,
} from "@app/types"

export type SubRow = {
  id: string
  status: SubscriptionStatus
  billing_period: BillingPeriod
  current_period_end: string
  plan: { name_id: string } | null
  user: { full_name: string; email: string } | null
}

export function SubscriptionsTable({ rows }: { rows: SubRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground border-border flex h-32 items-center justify-center rounded-xl border-2 border-dashed text-sm">
        Belum ada langganan
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-left">
            <th className="px-3 py-3 font-medium">Pengguna</th>
            <th className="px-3 py-3 font-medium">Paket</th>
            <th className="px-3 py-3 font-medium">Periode</th>
            <th className="px-3 py-3 font-medium">Berakhir</th>
            <th className="px-3 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-border/50 border-b">
              <td className="px-3 py-3">
                <div className="font-medium">{r.user?.full_name ?? "—"}</div>
                <div className="text-muted-foreground text-xs">{r.user?.email ?? ""}</div>
              </td>
              <td className="px-3 py-3">{r.plan?.name_id ?? "—"}</td>
              <td className="px-3 py-3">{BillingPeriodLabels[r.billing_period].id}</td>
              <td className="px-3 py-3">
                {new Date(r.current_period_end).toLocaleDateString("id-ID")}
              </td>
              <td className="px-3 py-3">
                <Badge variant={r.status === "active" ? "default" : "outline"}>
                  {SubscriptionStatusLabels[r.status].id}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
