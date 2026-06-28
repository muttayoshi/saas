import { Navbar } from "@/components/layout/navbar"
import { createClient } from "@/lib/supabase/server"
import type { Profile } from "@app/types"

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let profile: Profile | null = null
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()
    profile = data
  }

  return (
    <>
      <Navbar profile={profile} />
      <main className="flex-1">{children}</main>
    </>
  )
}
