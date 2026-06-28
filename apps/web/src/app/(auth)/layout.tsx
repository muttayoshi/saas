import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Autentikasi | SaaS",
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh bg-background flex">
      {/* Left — Branding Panel (desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden">
        {/* Ambient orbs */}
        <div className="orb orb-gold w-[600px] h-[600px] -top-32 -left-32 opacity-60" />
        <div className="orb orb-blue w-[400px] h-[400px] bottom-0 right-0 opacity-40" />

        {/* Grid background */}
        <div className="absolute inset-0 bg-grid opacity-30" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group w-fit">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-black text-xl group-hover:scale-105 transition-transform">
              S
            </div>
            <span className="font-display font-bold text-xl text-foreground">
              SaaS
            </span>
          </Link>

          {/* Hero copy */}
          <div className="space-y-6 max-w-lg">
            <h1 className="font-display text-4xl xl:text-5xl font-bold leading-tight">
              Bangun produk Anda <span className="gradient-text">lebih cepat</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Starter dengan autentikasi, profil pengguna, dan dashboard yang siap
              dikembangkan.
            </p>
          </div>

          <div />
        </div>
      </div>

      {/* Right — Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <Link href="/" className="flex items-center gap-3 group w-fit">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-black text-lg">
                S
              </div>
              <span className="font-display font-bold text-lg text-foreground">
                SaaS
              </span>
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
