import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users } from "lucide-react"
import { UserFilters } from "./_components/user-filters"
import { UserListTable, type UserRow } from "./_components/user-list-table"

type SearchParams = { q?: string; role?: string }

// PostgREST `.or()` uses commas and parens as syntax; strip them from user input.
function sanitize(value: string) {
  return value.replace(/[,()*]/g, " ").trim()
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const q = sp.q?.trim() ?? ""
  const role = sp.role ?? ""

  const supabase = await createClient()
  let query = supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, created_at")
    .order("created_at", { ascending: false })

  const search = sanitize(q)
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }
  if (role) query = query.eq("role", role)

  const { data, error } = await query
  const users = (data ?? []) as unknown as UserRow[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Pengguna</h1>
        <p className="text-muted-foreground mt-1">Daftar pengguna dengan filter</p>
      </div>

      <Card className="glass">
        <CardHeader className="space-y-4">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Semua Pengguna
          </CardTitle>
          <UserFilters q={q} role={role} />
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-destructive text-sm">
              Gagal memuat data: {error.message}
            </div>
          ) : (
            <UserListTable users={users} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
