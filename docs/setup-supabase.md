# Connect NTP Audit to Supabase

The application continues to use its server-side PostgreSQL queries and its own
role based login. Supabase supplies the managed PostgreSQL database and the
private workbook bucket; no browser receives the database password or the
Storage service-role key.

## 1. Link the project and apply its schema

Run these commands from the repository after logging in with `npx supabase login`:

```powershell
npx supabase link --project-ref iumzavjffaxbrlelfrpg
npx supabase db push
```

`supabase link` asks for the project database password. Enter it directly in
the terminal. Do not put it in chat or commit it to Git. The migration creates
the application tables, turns on row-level security for every payroll table,
and creates the private `ntp-private-uploads` bucket.

## 2. Configure server secrets

In `.env.local`, retain the existing `DATABASE_URL` temporarily as the local
source database, then add:

```dotenv
SUPABASE_DATABASE_URL=<Transaction pooler connection string from Supabase Connect, port 6543>
SUPABASE_URL=https://iumzavjffaxbrlelfrpg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase Settings → API>
SUPABASE_STORAGE_BUCKET=ntp-private-uploads
```

The production `DATABASE_URL` will later be set to the same value as
`SUPABASE_DATABASE_URL`. Keep the service-role key server-only: do not prefix
it with `NEXT_PUBLIC_`, and do not add it to Vercel browser environment values.

The shared Transaction Pooler gives IPv4 access for development machines and
serverless hosts. The app uses one database connection per warm server instance
for this mode. For certificate verification, download the Supabase root
certificate from **Database Settings → SSL Configuration** and set
`SUPABASE_SSL_ROOT_CERT` to its local path. Until that path is set, the app
still encrypts the connection but accepts the pooler's certificate without
local CA verification.

## 3. Migrate data and original workbooks once

The next command copies all existing NTP records and the original `.xlsx`
files from `.data/uploads` to the new private bucket. It deliberately requires
`--confirm` because it replaces NTP records in the target project.

```powershell
npm run db:migrate:supabase -- --confirm
```

After it succeeds, set `DATABASE_URL` to the Supabase pooler connection string
and restart `npm run dev`. Login sessions do not transfer, so sign in once with
the existing Admin account. Test a monthly original download and an Annual
export before deploying.

## 4. Production environment

Set `DATABASE_URL`, `SESSION_SECRET`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET` in the production
host's server environment. Set `PRIVATE_UPLOAD_DIR` only when retaining a local
development fallback. The application uses the private bucket automatically
when both Supabase URL and service-role key are configured.
