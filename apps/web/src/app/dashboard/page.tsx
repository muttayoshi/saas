import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getInitials } from "@app/utils"
import { UserRoleLabels, type UserRole } from "@app/types"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (!profile) redirect("/login")

  const roleLabel = UserRoleLabels[profile.role as UserRole]?.id ?? profile.role

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8 animate-fade-up">
        <Avatar className="h-14 w-14 ring-2 ring-primary/30">
          <AvatarImage src={profile.avatar_url ?? undefined} />
          <AvatarFallback className="text-lg">
            {getInitials(profile.full_name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-1">
            Selamat datang, {profile.full_name.split(" ")[0]}!
          </h1>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
              {roleLabel}
            </span>
            <span className="text-xs text-muted-foreground">{profile.email}</span>
          </div>
        </div>
      </div>

      {/* Profile Completion reminder */}
      {(!profile.city || !profile.phone) && (
        <Card variant="glass" className="mb-8 p-5 border-primary/20 animate-fade-up animate-fade-up-delay-1">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-foreground mb-1 text-sm">
                ✨ Lengkapi profil Anda
              </h3>
              <p className="text-xs text-muted-foreground">
                Profil yang lengkap meningkatkan kepercayaan akun Anda.
              </p>
            </div>
            <Button variant="gold" size="sm" asChild className="shrink-0">
              <Link href="/dashboard/profile">Lengkapi</Link>
            </Button>
          </div>
        </Card>
      )}

      <Card variant="glass" className="p-6 animate-fade-up animate-fade-up-delay-2">
        <h2 className="font-display text-lg font-semibold text-foreground mb-2">Mulai</h2>
        <p className="text-sm text-muted-foreground">
          Ini adalah dashboard Anda. Tambahkan fitur aplikasi di sini.
        </p>
      </Card>
    </div>
  )
}
