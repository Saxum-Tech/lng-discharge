# Test User Provisioning

Use `npm run seed:test-users` to create the non-production accounts used for frontend and backend-admin access testing.

## Why this is a script instead of a migration

The accounts are operational test data, not application schema. Creating them in a SQL migration would permanently add environment-specific credentials to migration history and could unintentionally provision test logins in production. The script uses the Supabase Admin API with a service-role key so each environment can opt in explicitly.

## Required environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ALLOW_TEST_USER_SEEDING=true` | Yes | Explicit non-production safety acknowledgement. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service-role key used by the Admin API to create/update Auth users. |
| `TEST_PORTAL_EMAIL` | No | Overrides `frontend.test@lng.local`. |
| `TEST_PORTAL_PASSWORD` | No | Overrides `PortalTest!2026`. |
| `TEST_ADMIN_EMAIL` | No | Overrides `admin.test@lng.local`. |
| `TEST_ADMIN_PASSWORD` | No | Overrides `AdminTest!2026`. |

## Provisioned records

The script is idempotent and creates or updates:

1. `companies`: `LNG Test Company` for the frontend portal test user.
2. Supabase Auth users for the frontend and backend-admin accounts.
3. `profiles`: role and active-status records linked to each Auth user.

No additional SQL migration is required. The existing schema and RLS migration history remains in `supabase/migrations/`.
