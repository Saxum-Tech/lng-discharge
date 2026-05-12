# LNG Discharge Window Planner

A Next.js application with three runtime surfaces in one codebase:

| Surface | Routes | Purpose |
|---------|--------|---------|
| Frontend portal | `/login`, `/calendar`, `/day/*`, `/analysis`, `/my-entries`, `/profile` | Stakeholder-facing LNG discharge planning portal for active `viewer` and `company_admin` users. |
| Backend admin console | `/admin/login`, `/admin/*` | Hosting-company administration console for active `superadmin` users only. |
| Backend API | `/api/*` | Server-side operational endpoints, including public data synchronization. |

## Quick start

```bash
# Install dependencies
npm install

# Copy environment variables and fill in your Supabase credentials
cp .env.example .env.local

# Run the application in development
npm run dev
```

The development server defaults to <http://localhost:3000>.

## Node.js version parity (local, CI, production)

- Required Node.js version: **20.19.x** (exact tested major/minor line).
- Local development: use `.nvmrc` (`nvm use`) to align your shell.
- CI: pin the same `20.19.x` line in your Node setup step.
- Vercel: set Project Settings → Node.js Version to **20.x** so build/runtime stay aligned with `package.json` engines.

## Supabase setup

1. Create a Supabase project at <https://supabase.com>.
2. Run the migrations in `supabase/migrations/` in order against your project.
3. Enable Storage and create a public bucket named `branding`.
4. Enable Row Level Security on all tables.

## Test users

Test users are created with the Supabase Admin API so credentials are not committed into migration history or production schema changes. The script is idempotent: it creates or updates the Auth user, the matching `profiles` row, and a reusable `LNG Test Company` record for the frontend portal account.

```bash
ALLOW_TEST_USER_SEEDING=true \
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
npm run seed:test-users
```

Default non-production accounts created by the script:

| Account | Email | Default password | Role | Expected access |
|---------|-------|------------------|------|-----------------|
| Frontend test user | `frontend.test@lng.local` | `PortalTest!2026` | `viewer` | Frontend portal only |
| Backend admin test user | `admin.test@lng.local` | `AdminTest!2026` | `superadmin` | Backend admin console only |

You can override the defaults without changing code:

```bash
TEST_PORTAL_EMAIL="portal.user@example.com" \
TEST_PORTAL_PASSWORD="replace-with-a-strong-password" \
TEST_ADMIN_EMAIL="admin.user@example.com" \
TEST_ADMIN_PASSWORD="replace-with-a-strong-password" \
ALLOW_TEST_USER_SEEDING=true \
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
npm run seed:test-users
```

> **Database history note:** No SQL migration is required for these test users. They are environment-specific operational data. Keep this script restricted to non-production projects unless you intentionally want these accounts in that environment.

## Access control model

| Role | Access |
|------|--------|
| `superadmin` | Backend admin console only; full branding, company, user, audit, and system management. |
| `company_admin` | Frontend portal; can manage own company's users where supported by RLS/API flows. |
| `viewer` | Frontend portal; can read public data and add own private entries. |

Access is enforced in multiple layers:

- `middleware.ts` validates authenticated users with Supabase `getUser()` and checks both `profiles.role` and `profiles.is_active` before allowing protected routes.
- Login pages call the shared auth context with route-specific allowed roles, so users receive immediate feedback when attempting to sign into the wrong surface.
- Supabase RLS policies in `supabase/migrations/` enforce database-level access by role and company.

## Public data sync (cruise + flights)

The app can ingest public schedule data into `cruise_schedules` and `flights` via:

- `POST /api/sync/public-data` (manual trigger from Admin → System Settings)
- A cron trigger using `Authorization: Bearer ${SYNC_CRON_TOKEN}`
- Vercel cron is configured in `vercel.json` to run daily at midnight UTC (`0 0 * * *`)

Configure these environment variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SYNC_CRON_TOKEN`
  - `CRON_SECRET` is also accepted (useful for Vercel cron auth header)
- `GIBRALTAR_CRUISE_SCHEDULE_URL` (optional override)
- `GIBRALTAR_AIRPORT_FLIGHTS_URL` (optional override)
- `AVIATIONSTACK_API_KEY` (optional fallback if no key is saved in System Settings)
- `FREE_FLIGHT_API_URL` (optional override)

`aviation_api_key` is managed from System Settings and is used for free flight API ingestion when provided. If that setting is blank, the sync falls back to `AVIATIONSTACK_API_KEY`.

## Operational planning additions

- Manual **ferry schedules** and **operational events** are now supported alongside flights and cruises.
- **Planned LNG discharges** can be created/updated with vessel, date, target alongside time, quantity, status, and notes.
- Calendar suitability now uses traffic blocking + weather safety scoring (`Green` / `Orange` / `Red`) with day-level reason codes.
- Event/discharge create/update/delete operations are written to `audit_logs` through database triggers.

### Weather limiting factors used by planning

Planning warnings are evaluated against the operational limits provided by terminal guidance:

- Berthing limits: **Hs > 1.0 m** or **wind > 10 m/s**.
- Alongside directional limits (wave direction + period bands 5s/8s/10s) are applied for additional stop conditions.

## Go-live runbook checklist

- Configure environment variables in `.env.example` (Supabase + sync auth keys).
- Confirm `app_settings` singleton row exists and timezone is set correctly.
- Run all migrations in order (`001`, `002`, `003`) before first production deploy.
- Verify daily sync execution (`/api/sync/public-data`) and audit log entries for completed/skipped/failed runs.
- Validate UAT scenarios for owner/admin, terminal user, and barge operator workflows.
- Confirm backup/restore process for Supabase project and retention policy for `audit_logs`.
- Set monitoring alerts for sync failures, auth failures, and sustained weather API errors.

## Project structure

```text
lng-discharge/
  src/app/                 Next.js App Router pages and API routes
  src/components/          Shared UI, portal, and admin components
  src/contexts/            Client-side providers and auth state
  src/lib/                 Supabase clients, shared types, role helpers, utilities
  scripts/                 Operational scripts such as test-user seeding
  supabase/migrations/     PostgreSQL schema, RLS policies, and migration history
```
