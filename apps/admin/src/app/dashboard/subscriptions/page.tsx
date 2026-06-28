import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CreditCard, Receipt } from "lucide-react"
import { SubscriptionsTable, type SubRow } from "./_components/subscriptions-table"
import { PaymentsTable, type PaymentRow } from "./_components/payments-table"

export default async function SubscriptionsPage() {
  const supabase = await createClient()

  const { data: subsData } = await supabase
    .from("subscriptions")
    .select(
      "id, status, billing_period, current_period_end, plan:subscription_plans(name_id), user:profiles!subscriptions_user_profiles_fk(full_name, email)"
    )
    .order("current_period_end", { ascending: false })

  const { data: payData } = await supabase
    .from("payments")
    .select(
      "id, order_id, amount, status, created_at, plan:subscription_plans(name_id), user:profiles!payments_user_profiles_fk(email)"
    )
    .order("created_at", { ascending: false })
    .limit(50)

  const subs = (subsData ?? []) as unknown as SubRow[]
  const payments = (payData ?? []) as unknown as PaymentRow[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Langganan</h1>
        <p className="text-muted-foreground mt-1">Data langganan & pembayaran pengguna</p>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Langganan Aktif & Riwayat
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SubscriptionsTable rows={subs} />
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Pembayaran Terbaru
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentsTable rows={payments} />
        </CardContent>
      </Card>
    </div>
  )
}
