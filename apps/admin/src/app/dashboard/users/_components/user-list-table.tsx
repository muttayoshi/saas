import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export type UserRow = {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: string
  created_at: string
}

export function UserListTable({ users }: { users: UserRow[] }) {
  if (users.length === 0) {
    return (
      <div className="text-muted-foreground border-border flex h-48 items-center justify-center rounded-xl border-2 border-dashed text-sm">
        Tidak ada pengguna
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-left">
            <th className="px-3 py-3 font-medium">Nama</th>
            <th className="px-3 py-3 font-medium">Email</th>
            <th className="px-3 py-3 font-medium">HP</th>
            <th className="px-3 py-3 font-medium">Role</th>
            <th className="px-3 py-3 font-medium">Daftar</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr
              key={u.id}
              className="border-border/50 hover:bg-secondary/50 border-b transition-colors"
            >
              <td className="px-3 py-3 font-medium">
                <Link href={`/dashboard/users/${u.id}`} className="hover:underline">
                  {u.full_name || "—"}
                </Link>
              </td>
              <td className="text-muted-foreground px-3 py-3">{u.email}</td>
              <td className="text-muted-foreground px-3 py-3">{u.phone ?? "—"}</td>
              <td className="px-3 py-3">
                <Badge variant="outline">{u.role}</Badge>
              </td>
              <td className="text-muted-foreground px-3 py-3">
                {new Date(u.created_at).toLocaleDateString("id-ID")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
