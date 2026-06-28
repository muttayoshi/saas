import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, ShieldCheck } from "lucide-react"

export default async function AdminDashboardOverview() {
  const supabase = await createClient()

  const { count: profilesCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
  const { count: adminCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin")

  const stats = [
    { title: "Total Pengguna", value: profilesCount || 0, icon: Users, color: "text-purple-500" },
    { title: "Admin", value: adminCount || 0, icon: ShieldCheck, color: "text-emerald-500" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Overview</h1>
        <p className="text-muted-foreground mt-1">Ringkasan platform</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i} className="glass">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-display">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle>Aktivitas Terbaru</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm border-2 border-dashed border-border rounded-xl">
            Belum ada aktivitas
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
