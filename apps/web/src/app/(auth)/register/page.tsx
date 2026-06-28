"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Eye, EyeOff, Loader2, Mail, Lock, User, Phone, CheckCircle2
} from "lucide-react"
import type { Register } from "@app/types"
import { RegisterSchema } from "@app/types"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Register>({ resolver: zodResolver(RegisterSchema) })

  async function onSubmit(data: Register) {
    setServerError(null)
    const supabase = createClient()

    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.full_name,
          phone: data.phone ?? "",
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setServerError(error.message)
      return
    }

    setEmailSent(true)
  }

  // Email sent confirmation screen
  if (emailSent) {
    return (
      <div className="space-y-6 animate-fade-up text-center">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-success/15 border border-success/30 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Cek email Anda!
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Kami mengirimkan link verifikasi ke email Anda.
            Klik link tersebut untuk mengaktifkan akun.
          </p>
        </div>
        <Link href="/login">
          <Button variant="outline" className="w-full">
            Kembali ke halaman masuk
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Buat akun baru
        </h1>
        <p className="text-sm text-muted-foreground">
          Daftar untuk mulai menggunakan aplikasi
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Full name */}
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Nama Lengkap</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="full_name"
              placeholder="Nama lengkap Anda"
              className="pl-9"
              {...register("full_name")}
            />
          </div>
          {errors.full_name && (
            <p className="text-xs text-destructive">{errors.full_name.message}</p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="nama@email.com"
              className="pl-9"
              autoComplete="email"
              {...register("email")}
            />
          </div>
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        {/* Phone (optional) */}
        <div className="space-y-1.5">
          <Label htmlFor="phone">
            Nomor HP <span className="text-muted-foreground font-normal">(opsional)</span>
          </Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="phone"
              type="tel"
              placeholder="08xxxxxxxxxx"
              className="pl-9"
              {...register("phone")}
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Min. 8 karakter, huruf kapital & angka"
              className="pl-9 pr-10"
              autoComplete="new-password"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        {/* Server error */}
        {serverError && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
            {serverError}
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          variant="gold"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Mendaftar...
            </>
          ) : (
            "Daftar Sekarang"
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Dengan mendaftar, Anda menyetujui{" "}
          <Link href="/terms" className="text-primary hover:underline underline-offset-4">
            Syarat & Ketentuan
          </Link>{" "}
          kami.
        </p>
      </form>

      {/* Login link */}
      <p className="text-center text-sm text-muted-foreground">
        Sudah punya akun?{" "}
        <Link
          href="/login"
          className="text-primary font-medium hover:underline underline-offset-4"
        >
          Masuk
        </Link>
      </p>
    </div>
  )
}
