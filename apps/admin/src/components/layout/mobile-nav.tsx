"use client"

import { useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { UserMenu } from "@/components/layout/user-menu"
import { ThemeToggle } from "@/components/layout/theme-toggle"

export function MobileNav({ fullName }: { fullName: string }) {
  const [open, setOpen] = useState(false)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="text-muted-foreground hover:bg-secondary hover:text-foreground flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
        aria-label="Buka menu"
      >
        <Menu className="h-5 w-5" />
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "border-sidebar-border bg-sidebar fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
            "duration-200"
          )}
        >
          <DialogPrimitive.Title className="sr-only">Menu navigasi</DialogPrimitive.Title>

          <div className="border-sidebar-border flex h-16 items-center justify-between border-b px-6">
            <div className="flex items-center gap-2">
              <div className="bg-sidebar-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black">
                M
              </div>
              <span className="font-display text-sidebar-foreground font-bold">
                Admin Panel
              </span>
            </div>
            <DialogPrimitive.Close
              className="text-muted-foreground hover:bg-secondary hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
              aria-label="Tutup menu"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto">
            <SidebarNav onNavigate={() => setOpen(false)} />
          </div>

          <div className="border-sidebar-border flex items-center gap-2 border-t p-3">
            <div className="min-w-0 flex-1">
              <UserMenu fullName={fullName} />
            </div>
            <ThemeToggle />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
