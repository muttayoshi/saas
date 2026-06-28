import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"
import pg from "pg"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
config({ path: join(root, ".env.local") })
config({ path: join(root, ".env") })

const connectionString = process.env.DIRECT_URL
if (!connectionString) {
  console.error("Missing DIRECT_URL. Set it in .env.local.")
  process.exit(1)
}

const client = new pg.Client({ connectionString })
await client.connect()
try {
  const sql = readFileSync(join(root, "supabase", "seed.sql"), "utf8")
  await client.query(sql)
  console.log("Seed applied.")
} finally {
  await client.end()
}
