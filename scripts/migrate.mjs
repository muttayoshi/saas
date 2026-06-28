import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"
import pg from "pg"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

// Load .env.local first (takes precedence), then .env as fallback.
config({ path: join(root, ".env.local") })
config({ path: join(root, ".env") })

const connectionString = process.env.DIRECT_URL
if (!connectionString) {
  console.error("Missing DIRECT_URL. Set it in .env.local (direct 5432 Postgres URL).")
  process.exit(1)
}

const migrationsDir = join(root, "supabase", "migrations")

function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

async function appliedVersions(client) {
  const { rows } = await client.query("SELECT version FROM schema_migrations")
  return new Set(rows.map((r) => r.version))
}

async function main() {
  const [, , cmd, arg] = process.argv
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await ensureTable(client)

    if (cmd === "baseline") {
      if (!arg) {
        console.error("Usage: node scripts/migrate.mjs baseline <prefix>  (e.g. 006)")
        process.exit(1)
      }
      const files = migrationFiles().filter((f) => f.slice(0, arg.length) <= arg)
      for (const f of files) {
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
          [f]
        )
        console.log(`baselined ${f}`)
      }
      console.log("Baseline complete.")
      return
    }

    const applied = await appliedVersions(client)
    const pending = migrationFiles().filter((f) => !applied.has(f))
    if (pending.length === 0) {
      console.log("No pending migrations.")
      return
    }
    for (const f of pending) {
      const sql = readFileSync(join(migrationsDir, f), "utf8")
      console.log(`applying ${f} ...`)
      await client.query("BEGIN")
      try {
        await client.query(sql)
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [f])
        await client.query("COMMIT")
        console.log(`  ok ${f}`)
      } catch (err) {
        await client.query("ROLLBACK")
        console.error(`  FAILED ${f}: ${err.message}`)
        throw err
      }
    }
    console.log("All migrations applied.")
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
