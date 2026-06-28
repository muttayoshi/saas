# SaaS

> Platform Ekosistem Franchise #1 di Indonesia

A full-stack franchise marketplace connecting **Franchise Owners**, **Investors**, **Landlords**, and **Workers** in a single platform.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, TypeScript, TailwindCSS, shadcn/ui |
| State | TanStack Query, React Hook Form, Zod |
| Backend | Supabase (PostgreSQL 17, Auth, Storage, RLS) |
| Maps | Mapbox GL JS |
| Monorepo | Turborepo + pnpm workspaces |
| Hosting | Vercel (frontend) + Supabase Cloud (backend) |

## Project Structure

```
franchise-investor/
├── apps/
│   ├── web/          # Customer-facing site (Next.js 16)
│   └── admin/        # Admin panel (Phase 2+)
├── packages/
│   ├── ui/           # Shared shadcn/ui components
│   ├── types/        # Zod schemas & TypeScript types
│   ├── utils/        # Shared utility functions
│   └── typescript-config/  # Shared tsconfig
├── supabase/
│   ├── migrations/   # Database migrations
│   ├── seed.sql      # Seed data
│   └── policies.sql  # RLS policies reference
└── .docs/            # Internal documentation (gitignored)
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build all packages
pnpm build
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values.

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_MAPBOX_TOKEN`

## Phase Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1.1 | Marketplace MVP | ✅ Completed |
| Phase 1.2 | Light/Dark Theme & Admin Panel | ✅ Completed |
| Phase 2 | Subscription Revenue | 🚧 Next |
| Phase 3 | AI Matching | ⏳ Planned |
| Phase 4 | Mobile App | ⏳ Planned |
