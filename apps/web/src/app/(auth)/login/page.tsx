import { Suspense } from "react"
import type { Metadata } from "next"
import LoginForm from "./_components/login-form"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "Masuk | SaaS",
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}>
      <LoginForm />
    </Suspense>
  )
}
