import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CreditCard } from "lucide-react"
import { getInitials } from "@app/utils"
import { UserRoleLabels, type UserRole } from "@app/types"
import { getCurrentSubscription } from "@/lib/subscription/access"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (!profile) redirect("/login")

  const roleLabel = UserRoleLabels[profile.role as UserRole]?.id ?? profile.role

  const { plan, subscription } = await getCurrentSubscription(user.id)
  const periodEnd = subscription
    ? new Date(subscription.current_period_end).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Welcome header */}
      <div className="animate-fade-up mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Avatar className="ring-primary/30 h-14 w-14 ring-2">
          <AvatarImage src={profile.avatar_url ?? undefined} />
          <AvatarFallback className="text-lg">
            {getInitials(profile.full_name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="font-display text-foreground mb-1 text-2xl font-bold">
            Selamat datang, {profile.full_name.split(" ")[0]}!
          </h1>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
              {roleLabel}
            </span>
            <span className="text-muted-foreground text-xs">{profile.email}</span>
          </div>
        </div>
      </div>

      {/* Profile Completion reminder */}
      {(!profile.city || !profile.phone) && (
        <Card
          variant="glass"
          className="border-primary/20 animate-fade-up animate-fade-up-delay-1 mb-8 p-5"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-foreground mb-1 text-sm font-semibold">
                ✨ Lengkapi profil Anda
              </h3>
              <p className="text-muted-foreground text-xs">
                Profil yang lengkap meningkatkan kepercayaan akun Anda.
              </p>
            </div>
            <Button variant="gold" size="sm" asChild className="shrink-0">
              <Link href="/dashboard/profile">Lengkapi</Link>
            </Button>
          </div>
        </Card>
      )}

      {/* Subscription summary */}
      <Card variant="glass" className="animate-fade-up animate-fade-up-delay-2 mb-8 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-foreground text-sm font-semibold">
                Paket {plan.name_id}
                {!subscription && (
                  <span className="text-muted-foreground font-normal"> (Gratis)</span>
                )}
              </h3>
              <p className="text-muted-foreground text-xs">
                {subscription
                  ? `Aktif sampai ${periodEnd}`
                  : "Upgrade untuk membuka lebih banyak fitur."}
              </p>
            </div>
          </div>
          <Button variant="gold" size="sm" asChild className="shrink-0">
            <Link href="/dashboard/subscription">
              {subscription ? "Kelola" : "Lihat Paket"}
            </Link>
          </Button>
        </div>
      </Card>

      <Card variant="glass" className="animate-fade-up animate-fade-up-delay-3 p-6">
        <h2 className="font-display text-foreground mb-2 text-lg font-semibold">Mulai</h2>
        <p className="text-muted-foreground text-sm">
          Ini adalah dashboard Anda. Tambahkan fitur aplikasi di sini.
        </p>
      </Card>
    </div>
  )
}
