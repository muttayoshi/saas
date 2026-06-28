"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LogOut, User, LayoutDashboard, ChevronDown, CreditCard } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { Profile } from "@app/types"
import { getInitials } from "@app/utils"
import { ThemeToggle } from "./theme-toggle"

interface NavbarProps {
  profile?: Profile | null
}

export function Navbar({ profile }: NavbarProps) {
  const router = useRouter()
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setIsScrolled(window.scrollY > 16)
    window.addEventListener("scroll", handler, { passive: true })
    return () => window.removeEventListener("scroll", handler)
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <header
      className={cn(
        "fixed top-0 right-0 left-0 z-40 transition-all duration-300",
        isScrolled ? "glass-strong border-border border-b shadow-xl" : "bg-transparent"
      )}
    >
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg text-base font-black transition-transform group-hover:scale-105">
              S
            </div>
            <span className="font-display text-foreground hidden text-base font-bold sm:block">
              SaaS
            </span>
          </Link>

          {/* Auth / Profile */}
          <div className="flex items-center gap-2">
            {profile ? (
              /* Logged in — user menu */
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="hover:bg-secondary group flex items-center gap-2 rounded-xl p-1.5 pr-2.5 transition-colors duration-150">
                    <Avatar className="ring-primary/30 h-7 w-7 ring-1">
                      <AvatarImage src={profile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {getInitials(profile.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-foreground hidden max-w-[100px] truncate text-sm font-medium sm:block">
                      {profile.full_name.split(" ")[0]}
                    </span>
                    <ChevronDown className="text-muted-foreground group-hover:text-foreground h-3.5 w-3.5 transition-colors" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-0.5">
                      <p className="text-foreground truncate text-sm font-medium">
                        {profile.full_name}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {profile.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/profile" className="gap-2">
                      <User className="h-4 w-4" />
                      Profil Saya
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/subscription" className="gap-2">
                      <CreditCard className="h-4 w-4" />
                      Langganan
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="text-destructive focus:text-destructive gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    Keluar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              /* Logged out */
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="hidden sm:inline-flex"
                >
                  <Link href="/login">Masuk</Link>
                </Button>
                <Button variant="gold" size="sm" asChild>
                  <Link href="/register">Daftar</Link>
                </Button>
              </>
            )}

            <ThemeToggle />
          </div>
        </div>
      </nav>
    </header>
  )
}
