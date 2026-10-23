# Setup

1. **Neon database** — create a Neon project, open the SQL Editor and run `db/schema.sql`. It creates the tables, constraints, atomic functions and one contest row.
2. **Environment** — copy `.env.example` to `.env` and set `DATABASE_URL` (your Neon connection string), `ADMIN_USERNAME` and `ADMIN_PASSWORD`. `NODE_ENV` is `development` locally and `production` on Vercel.
3. **Admin login** — sign in at `/admin` with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env` (change them there and restart to rotate).
4. `npm run dev`, then open `/admin`, sign in, set title/instructions/window/timezone, and open entry access.
5. **Scheduler** — `vercel.json` calls `/api/cron/finalize` every minute (Vercel Cron needs a plan that allows per-minute crons). Writes also finalize lazily, so the deadline is enforced either way.

Before launch: turn **Allow repeat attempts (testing)** OFF and verify it on the dashboard.
