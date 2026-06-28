"use client"

import { useState, useTransition } from "react"
import Script from "next/script"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Check } from "lucide-react"
import { createSubscriptionPayment } from "../actions"
import type { Plan, BillingPeriod } from "@app/types"

const SNAP_URL =
  process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true"
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js"

type SnapWindow = Window & {
  snap?: { pay: (token: string, opts: Record<string, (r?: unknown) => void>) => void }
}

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n)
}

export function PlanCards({
  plans,
  currentPlanId,
}: {
  plans: Plan[]
  currentPlanId: string
}) {
  const router = useRouter()
  const [period, setPeriod] = useState<BillingPeriod>("monthly")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function subscribe(planId: string) {
    setError(null)
    startTransition(async () => {
      const res = await createSubscriptionPayment(planId, period)
      if (!res.ok) {
        setError(res.error)
        return
      }
      const snap = (window as SnapWindow).snap
      if (!snap) {
        setError("Gagal memuat Midtrans. Muat ulang halaman.")
        return
      }
      const back = () => router.push(`/dashboard/subscription?order_id=${res.orderId}`)
      snap.pay(res.token, {
        onSuccess: back,
        onPending: back,
        onClose: () => {},
        onError: () => setError("Pembayaran gagal."),
      })
    })
  }

  return (
    <div className="space-y-4">
      <Script
        src={SNAP_URL}
        data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
        strategy="afterInteractive"
      />

      <div className="border-border inline-flex rounded-lg border p-1">
        {(["monthly", "yearly"] as BillingPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              period === p
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            {p === "monthly" ? "Bulanan" : "Tahunan"}
          </button>
        ))}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = period === "monthly" ? plan.price_monthly : plan.price_yearly
          const isCurrent = plan.id === currentPlanId
          const isFree = plan.tier_level <= 0
          return (
            <Card key={plan.id} className="glass flex flex-col">
              <CardHeader>
                <CardTitle>{plan.name_id}</CardTitle>
                <p className="text-2xl font-bold">{isFree ? "Gratis" : rupiah(price)}</p>
                {!isFree && (
                  <p className="text-muted-foreground text-xs">
                    per {period === "monthly" ? "bulan" : "tahun"}
                  </p>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <ul className="flex-1 space-y-2 text-sm">
                  {plan.features_id.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="text-primary mt-0.5 h-4 w-4" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  disabled={isCurrent || isFree || pending}
                  onClick={() => subscribe(plan.id)}
                >
                  {isCurrent
                    ? "Paket Aktif"
                    : isFree
                      ? "Gratis"
                      : pending
                        ? "Memproses..."
                        : "Berlangganan"}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
