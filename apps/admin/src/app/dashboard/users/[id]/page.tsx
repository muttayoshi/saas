import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AccountSection, type Account } from "./_components/account-section"

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single()
  if (!profile) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/users">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali ke daftar pengguna
          </Button>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold">
            {profile.full_name || profile.email}
          </h1>
          <Badge variant="outline">{profile.role}</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">{profile.email}</p>
      </div>

      <Card className="glass">
        <CardContent className="pt-6">
          <AccountSection
            account={
              {
                id: profile.id,
                full_name: profile.full_name,
                email: profile.email,
                phone: profile.phone ?? null,
                role: profile.role,
                company_name: profile.company_name ?? null,
                city: profile.city ?? null,
                province: profile.province ?? null,
                bio: profile.bio ?? null,
              } satisfies Account
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
