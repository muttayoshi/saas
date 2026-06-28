"use client"

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { LogOut, ChevronsUpDown } from "lucide-react"

export function UserMenu({ fullName }: { fullName: string }) {
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="hover:bg-secondary flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors outline-none">
          <div className="bg-secondary text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
            {initials || "AD"}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sidebar-foreground truncate text-sm leading-none font-medium">
              {fullName}
            </span>
            <span className="text-muted-foreground text-xs">Admin</span>
          </div>
          <ChevronsUpDown className="text-muted-foreground h-4 w-4 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)]"
      >
        <DropdownMenuLabel className="truncate">{fullName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action="/auth/signout" method="post" className="w-full">
            <button
              type="submit"
              className="text-destructive flex w-full items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Keluar
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
