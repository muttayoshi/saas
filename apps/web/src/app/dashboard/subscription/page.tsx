import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCurrentSubscription } from "@/lib/subscription/access"
import { reconcilePayment } from "./actions"
import { SubscriptionStatus } from "./_components/subscription-status"
import { PlanCards } from "./_components/plan-cards"
import type { Plan } from "@app/types"

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?redirectTo=/dashboard/subscription")

  // Returning from Snap: reconcile against Midtrans before reading current state.
  const sp = await searchParams
  if (sp.order_id) await reconcilePayment(sp.order_id)

  const { plan, subscription } = await getCurrentSubscription(user.id)

  const { data: plansData } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
  const plans = (plansData ?? []) as unknown as Plan[]

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Langganan</h1>
        <p className="text-muted-foreground mt-1">Kelola paket langganan Anda</p>
      </div>

      <SubscriptionStatus plan={plan} subscription={subscription} />
      <PlanCards plans={plans} currentPlanId={plan.id} />
    </main>
  )
}
