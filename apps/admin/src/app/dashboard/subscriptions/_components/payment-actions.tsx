"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Check, X } from "lucide-react"
import { confirmPayment, rejectPayment } from "../actions"

export function PaymentActions({ paymentId }: { paymentId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(action: "confirm" | "reject") {
    const label =
      action === "confirm" ? "Konfirmasi pembayaran ini?" : "Tolak pembayaran ini?"
    if (!confirm(label)) return
    setError(null)
    startTransition(async () => {
      const res =
        action === "confirm"
          ? await confirmPayment(paymentId)
          : await rejectPayment(paymentId)
      if (res.ok === false) setError(res.error)
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-destructive text-xs">{error}</span>}
      <Button
        size="sm"
        variant="default"
        disabled={pending}
        onClick={() => run("confirm")}
      >
        <Check className="mr-1 h-3.5 w-3.5" />
        Konfirmasi
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run("reject")}
      >
        <X className="mr-1 h-3.5 w-3.5" />
        Tolak
      </Button>
    </div>
  )
}
