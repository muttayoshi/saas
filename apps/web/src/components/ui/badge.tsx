import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:     "bg-primary/15 text-primary border border-primary/30",
        secondary:   "bg-secondary text-secondary-foreground border border-border",
        outline:     "bg-transparent border border-border text-foreground",
        destructive: "bg-destructive/15 text-destructive border border-destructive/30",
        success:     "bg-success/15 text-emerald-400 border border-success/30",
        // Lead statuses
        new:         "badge-new",
        contacted:   "badge-contacted",
        qualified:   "badge-qualified",
        closed:      "badge-closed",
        // Listing statuses
        published:   "badge-published",
        draft:       "badge-draft",
        archived:    "badge-archived",
        // Category colors
        fnb:        "bg-orange-500/15 text-orange-400 border border-orange-500/30",
        retail:     "bg-blue-500/15 text-blue-400 border border-blue-500/30",
        jasa:       "bg-purple-500/15 text-purple-400 border border-purple-500/30",
        pendidikan: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30",
        kesehatan:  "bg-rose-500/15 text-rose-400 border border-rose-500/30",
        laundry:    "bg-teal-500/15 text-teal-400 border border-teal-500/30",
        otomotif:   "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
