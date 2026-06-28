import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <section className="relative flex min-h-dvh items-center justify-center px-4">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground">
          S
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Selamat datang di <span className="text-primary">SaaS</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
          Starter aplikasi dengan autentikasi Supabase, profil pengguna, dan dashboard.
          Mulai bangun fitur Anda dari sini.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {user ? (
            <Button variant="gold" size="lg" asChild>
              <Link href="/dashboard" className="gap-2">
                Buka Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button variant="gold" size="lg" asChild>
                <Link href="/register" className="gap-2">
                  Daftar Sekarang
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/login">Masuk</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
