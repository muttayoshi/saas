import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CreditCard } from "lucide-react"
import type { Plan, Subscription } from "@app/types"

function daysUntil(isoDate: string): number {
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000))
}

export function SubscriptionStatus({
  plan,
  subscription,
}: {
  plan: Plan
  subscription: Subscription | null
}) {
  const daysLeft = subscription ? daysUntil(subscription.current_period_end) : null

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Paket Anda Saat Ini
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">{plan.name_id}</span>
          <Badge variant={subscription ? "default" : "outline"}>
            {subscription ? "Aktif" : "Gratis"}
          </Badge>
        </div>
        {subscription && (
          <p className="text-muted-foreground text-sm">
            Berlaku sampai{" "}
            {new Date(subscription.current_period_end).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            · {daysLeft} hari lagi
          </p>
        )}
      </CardContent>
    </Card>
  )
}
