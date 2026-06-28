import "server-only"
import { createClient } from "@supabase/supabase-js"

// Service-role client for server-to-server writes (webhook). Bypasses RLS — never expose to the browser.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase service env vars are not set")
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
