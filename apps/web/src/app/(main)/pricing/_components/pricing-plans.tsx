"use client"

import { useState } from "react"
import Link from "next/link"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BillingPeriodLabels, type BillingPeriod, type Plan } from "@app/types"

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n)
}

export function PricingPlans({
  plans,
  isLoggedIn,
}: {
  plans: Plan[]
  isLoggedIn: boolean
}) {
  const [period, setPeriod] = useState<BillingPeriod>("monthly")

  return (
    <div className="space-y-8">
      {/* Monthly / yearly toggle */}
      <div className="flex justify-center">
        <div className="border-border inline-flex rounded-lg border p-1">
          {(["monthly", "yearly"] as BillingPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {BillingPeriodLabels[p].id}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isFree = plan.tier_level <= 0
          const price = period === "monthly" ? plan.price_monthly : plan.price_yearly
          // Free → register (or dashboard if logged in). Paid → subscription page
          // (middleware sends logged-out users through login, then back to checkout).
          const href = isFree
            ? isLoggedIn
              ? "/dashboard"
              : "/register"
            : "/dashboard/subscription"
          const cta = isFree ? "Mulai Gratis" : "Pilih Paket"

          return (
            <Card key={plan.id} variant="glass" className="flex flex-col p-6">
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-xl font-bold">{plan.name_id}</h3>
                  {isFree && <Badge variant="outline">Gratis</Badge>}
                </div>
                {plan.description_id && (
                  <p className="text-muted-foreground mt-1 text-sm">
                    {plan.description_id}
                  </p>
                )}
              </div>

              <div className="mb-6">
                <span className="font-display text-3xl font-bold">
                  {isFree ? "Rp0" : rupiah(price)}
                </span>
                {!isFree && (
                  <span className="text-muted-foreground text-sm">
                    {" "}
                    / {period === "monthly" ? "bulan" : "tahun"}
                  </span>
                )}
              </div>

              <ul className="mb-6 flex-1 space-y-2 text-sm">
                {plan.features_id.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Button variant={isFree ? "outline" : "gold"} asChild className="w-full">
                <Link href={href}>{cta}</Link>
              </Button>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
