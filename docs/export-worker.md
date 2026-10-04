# Windows Annual Excel Export Worker

The Vercel application creates Annual Excel jobs. This Windows Worker uses the
existing Microsoft Excel template automation to create the workbook, then
uploads the result to private Supabase Storage. It makes only outbound HTTPS
requests, so it does not need a public IP address, firewall rule, or open port.

## One-time setup on the Windows machine

1. Install Node.js and Microsoft Excel. Clone this repository and run `npm ci`.
2. Copy the configuration file and edit its two values:

   ```powershell
   Copy-Item .env.worker.example .env.worker.local
   ```

   - `NTP_APP_URL` is the deployed Vercel URL.
   - `EXPORT_WORKER_TOKEN` must exactly match the secret set in Vercel.

3. Start the Worker from the repository root:

   ```powershell
   npm run worker:annual
   ```

Leave this command running on one Windows machine. When the website requests an
Annual Excel file, the button shows progress until this Worker completes it.
The generated file is kept privately for one hour, then the next Worker poll
removes it.

## Keep it running after restart

Use Windows Task Scheduler to create a task that starts at sign-in and runs:

```text
C:\Program Files\nodejs\npm.cmd run worker:annual
```

Set **Start in** to the repository folder. Configure the task to restart on
failure. The Worker has no database URL, Supabase service key, or incoming
network endpoint; it holds only the app URL and its dedicated Worker token.

## Vercel variables

Set these values in the Vercel project for Production, Preview, and Development
as appropriate:

```text
DATABASE_URL
SESSION_SECRET
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=ntp-private-uploads
EXPORT_WORKER_TOKEN
```

Use a new random token of at least 32 characters for `EXPORT_WORKER_TOKEN`, add
the same token to `.env.worker.local`, and never commit either local env file.
