import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { requireTier, getCurrentSubscription } from "@/lib/subscription/access"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sparkles } from "lucide-react"

export const metadata: Metadata = {
  title: "Fitur Premium",
}

// Minimum tier 1 = any paid plan (Free is tier 0). Users below this tier are
// redirected to /dashboard/subscription by requireTier — this single line is
// all a gated feature route needs.
const REQUIRED_TIER = 1

export default async function PremiumPage() {
  await requireTier(REQUIRED_TIER)

  // Past the gate, the user is authenticated and has tier >= REQUIRED_TIER.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { plan } = await getCurrentSubscription(user!.id)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="animate-fade-up mb-8 flex items-center gap-3">
        <div className="bg-primary/10 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
          <Sparkles className="h-6 w-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-foreground text-2xl font-bold">
              Fitur Premium
            </h1>
            <Badge>{plan.name_id}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Konten ini hanya untuk pelanggan berbayar (tier {REQUIRED_TIER}+).
          </p>
        </div>
      </div>

      <Card variant="glass" className="animate-fade-up animate-fade-up-delay-1 p-6">
        <h2 className="font-display text-foreground mb-2 text-lg font-semibold">
          🎉 Anda punya akses!
        </h2>
        <p className="text-muted-foreground text-sm">
          Karena langganan <strong>{plan.name_id}</strong> Anda aktif, halaman ini
          terbuka. Bangun fitur premium Anda di sini — cukup panggil{" "}
          <code className="bg-secondary rounded px-1 py-0.5 text-xs">
            requireTier(level)
          </code>{" "}
          di awal route untuk mengunci menu lain dengan cara yang sama.
        </p>
      </Card>
    </div>
  )
}
