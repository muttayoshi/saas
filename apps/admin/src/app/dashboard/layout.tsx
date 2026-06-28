import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { UserMenu } from "@/components/layout/user-menu"
import { MobileNav } from "@/components/layout/mobile-nav"

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") {
    redirect("/login")
  }

  return (
    <div className="bg-background flex min-h-dvh">
      {/* Sidebar */}
      <aside className="border-sidebar-border bg-sidebar hidden w-64 flex-col border-r md:flex">
        <div className="border-sidebar-border flex h-16 items-center gap-2 border-b px-6">
          <div className="bg-sidebar-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black">
            A
          </div>
          <span className="font-display text-sidebar-foreground font-bold">
            Admin Panel
          </span>
        </div>

        <SidebarNav />

        <div className="border-sidebar-border flex items-center gap-2 border-t p-3">
          <div className="min-w-0 flex-1">
            <UserMenu fullName={profile.full_name} />
          </div>
          <ThemeToggle />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-card/50 flex h-16 items-center gap-3 border-b px-4 backdrop-blur md:hidden">
          <MobileNav fullName={profile.full_name} />
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black">
              A
            </div>
            <span className="font-display font-bold">Admin</span>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </main>
    </div>
  )
}
