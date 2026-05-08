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

## Public data sync (cruise + flights)

The app can ingest public schedule data into `cruise_schedules` and `flights` via:

- `POST /api/sync/public-data` (manual trigger from Admin → System Settings)
- A cron trigger using `Authorization: Bearer ${SYNC_CRON_TOKEN}`
- Vercel cron is configured in `vercel.json` to run hourly (`0 * * * *`)

Configure these environment variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SYNC_CRON_TOKEN`
  - `CRON_SECRET` is also accepted (useful for Vercel cron auth header)
- `GIBRALTAR_CRUISE_SCHEDULE_URL` (optional override)
- `GIBRALTAR_AIRPORT_FLIGHTS_URL` (optional override)
- `FREE_FLIGHT_API_URL` (optional override)

`aviation_api_key` is managed from System Settings and is used for free flight API ingestion when provided.

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
