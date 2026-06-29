import { createClient } from "@/lib/supabase/server"
import { PlansManager } from "./_components/plans-manager"
import type { Plan } from "@app/types"

export default async function PlansPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("subscription_plans")
    .select("*")
    .order("sort_order", { ascending: true })
  const plans = (data ?? []) as unknown as Plan[]
  return <PlansManager plans={plans} />
}
