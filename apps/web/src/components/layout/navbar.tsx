"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  LogOut, User, LayoutDashboard, ChevronDown,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
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
        "fixed top-0 left-0 right-0 z-40 transition-all duration-300",
        isScrolled
          ? "glass-strong border-b border-border shadow-xl"
          : "bg-transparent"
      )}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-black text-base group-hover:scale-105 transition-transform">
              S
            </div>
            <span className="font-display font-bold text-base text-foreground hidden sm:block">
              SaaS
            </span>
          </Link>

          {/* Auth / Profile */}
          <div className="flex items-center gap-2">
            {profile ? (
              /* Logged in — user menu */
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-xl p-1.5 pr-2.5 hover:bg-secondary transition-colors duration-150 group">
                    <Avatar className="h-7 w-7 ring-1 ring-primary/30">
                      <AvatarImage src={profile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {getInitials(profile.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground hidden sm:block max-w-[100px] truncate">
                      {profile.full_name.split(" ")[0]}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-0.5">
                      <p className="text-sm font-medium text-foreground truncate">{profile.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
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
                <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
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
