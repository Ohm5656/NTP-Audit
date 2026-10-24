# Supabase keep-alive

The production app exposes a small, token-protected health endpoint at
`/api/health/supabase`. It runs `SELECT 1` against the configured PostgreSQL
connection and returns no application data. The GitHub Actions workflow calls
it once per day so the Free Plan project receives regular database activity.

## One-time setup

1. Generate a long random token. Do not use the Supabase service-role key.
2. Add `HEALTHCHECK_TOKEN` to the production environment in Vercel, then redeploy.
3. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**.
4. Add these two repository secrets:
   - `HEALTHCHECK_TOKEN`: the same token configured in Vercel.
   - `HEALTHCHECK_URL`: the production origin, for example `https://audit.example.com`.
5. Open **Actions → Supabase keep-alive**, choose **Run workflow**, and run it once.
6. Confirm the workflow succeeds and the endpoint returns `{"ok":true}`.

The endpoint must be called through the deployed app. Calling a static page or a
local development server does not keep the hosted Supabase project active.

The workflow is a best-effort way to reduce inactivity pauses. Supabase does
not publish a fixed activity threshold, so it is not an uptime guarantee.
