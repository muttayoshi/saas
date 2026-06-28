import "server-only"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Plan, Subscription } from "@app/types"

// The user's active subscription + its plan, or the Free plan when none is active.
export async function getCurrentSubscription(
  userId: string
): Promise<{ plan: Plan; subscription: Subscription | null }> {
  const supabase = await createClient()

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*, plan:subscription_plans(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("current_period_end", new Date().toISOString())
    .maybeSingle()

  if (sub && sub.plan) {
    const { plan, ...subscription } = sub as unknown as Subscription & { plan: Plan }
    return { plan, subscription }
  }

  const { data: free } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("slug", "free")
    .maybeSingle()

  // The Free plan is seeded by migration 003 and must always exist; fail loudly
  // rather than passing null through the `as Plan` cast and crashing callers later.
  if (!free)
    throw new Error("Free plan row (slug='free') missing from subscription_plans")

  return { plan: free as unknown as Plan, subscription: null }
}

export async function getCurrentTier(userId: string): Promise<number> {
  const { plan } = await getCurrentSubscription(userId)
  return plan?.tier_level ?? 0
}

// Guard for future gated routes: call at the top of a Server Component page/layout.
export async function requireTier(level: number): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const tier = await getCurrentTier(user.id)
  if (tier < level) redirect("/dashboard/subscription")
}
