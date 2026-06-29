import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { PricingPlans } from "./_components/pricing-plans"
import type { Plan } from "@app/types"

export const metadata: Metadata = {
  title: "Harga",
  description: "Pilih paket langganan yang sesuai dengan kebutuhan Anda.",
}

export default async function PricingPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: plansData } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
  const plans = (plansData ?? []) as unknown as Plan[]

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Harga yang <span className="text-primary">sederhana</span>
        </h1>
        <p className="text-muted-foreground mt-4 text-balance">
          Pilih paket yang sesuai. Tingkatkan atau perpanjang kapan saja.
        </p>
      </div>

      {plans.length === 0 ? (
        <p className="text-muted-foreground text-center text-sm">
          Belum ada paket tersedia.
        </p>
      ) : (
        <PricingPlans plans={plans} isLoggedIn={!!user} />
      )}
    </section>
  )
}
