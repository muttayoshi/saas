# Database migrations

Migrations live in `supabase/migrations/` and are applied in filename order by a
small Node runner.

The live Supabase project also has Supabase's dashboard migration ledger
(`supabase_migrations.schema_migrations`). Keep both ledgers aligned:

- `public.schema_migrations` is maintained by `pnpm db:migrate`.
- `supabase_migrations.schema_migrations` is the Supabase dashboard history.
- The initial cloud project used timestamped Supabase migrations for
  `001`-`007_storage_buckets`; later repo-runner migrations are recorded in both
  ledgers after they are applied.

## Setup

Add `DIRECT_URL` to `.env.local` — the **direct** (port 5432) Postgres connection
string from Supabase → Project Settings → Database:

```
DIRECT_URL="postgresql://postgres:PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres"
```

## First-time adoption (existing cloud DB)

If adopting an existing cloud DB that already has the first migrations applied
out-of-band, record them as applied WITHOUT re-running them:

```bash
pnpm db:migrate baseline 007
```

## Apply pending migrations

```bash
pnpm db:migrate
```

Idempotent: re-running applies only files not yet in `schema_migrations`.

## Seed (optional, manual)

```bash
pnpm db:seed
```
