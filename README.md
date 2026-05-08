# LNG Discharge Window Planner

A monorepo containing two portals powered by Supabase:

| Package | Description | Default Port |
|---------|-------------|--------------|
| `packages/app` | Stakeholder-facing frontend | 5173 |
| `packages/admin` | Hosting-company admin console | 5174 |
| `packages/shared` | Shared types, Supabase client, utilities | — |

## Quick start

```bash
# Install dependencies
pnpm install

# Copy env files and fill in your Supabase credentials
cp packages/app/.env.example packages/app/.env.local
cp packages/admin/.env.example packages/admin/.env.local

# Run both apps in development
pnpm dev:app       # http://localhost:5173
pnpm dev:admin     # http://localhost:5174
```

## Supabase setup

1. Create a Supabase project at https://supabase.com
2. Run the migrations in `supabase/migrations/` in order against your project
3. Enable Storage and create a public bucket named `branding`
4. Enable Row Level Security on all tables

## Role hierarchy

| Role | Access |
|------|--------|
| `superadmin` | Admin console — full branding, company & user management |
| `company_admin` | Frontend app + manage own company's users |
| `viewer` | Frontend app — read public data, add own private entries |

## Project structure

```
lng-discharge/
  packages/
    app/          ← React + Vite stakeholder frontend
    admin/        ← React + Vite hosting-company admin console
    shared/       ← TypeScript types, Supabase client, utils
  supabase/
    migrations/   ← PostgreSQL schema & RLS policies
```