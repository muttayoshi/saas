import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { User } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getInitials } from "@app/utils"
import { UserRoleLabels, type Profile, type UserRole } from "@app/types"
import { ProfileForm } from "./_components/profile-form"

export const metadata: Metadata = {
  title: "Profil Saya",
}

export default async function ProfilePage() {
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

  const roleLabel =
    UserRoleLabels[profile.role as UserRole]?.id ?? profile.role

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-foreground text-2xl font-bold">Profil Saya</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Kelola informasi profil dan detail kontak Anda.
        </p>
      </div>

      <div className="flex flex-col items-start gap-8 md:flex-row">
        <div className="bg-secondary/30 border-border/50 flex w-full flex-col items-center rounded-2xl border p-6 text-center md:w-1/3">
          <Avatar className="ring-primary/20 mb-4 h-24 w-24 ring-4">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="bg-secondary text-foreground text-2xl">
              {getInitials(profile.full_name)}
            </AvatarFallback>
          </Avatar>

          <h2 className="text-foreground text-lg font-bold">{profile.full_name}</h2>
          <p className="text-muted-foreground mb-3 text-sm">{profile.email}</p>

          <div className="bg-primary/10 text-primary border-primary/30 inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium">
            <User className="mr-1.5 h-3 w-3" />
            {roleLabel}
          </div>
        </div>

        <div className="w-full md:w-2/3">
          <ProfileForm initialData={profile as Profile} />
        </div>
      </div>
    </div>
  )
}
