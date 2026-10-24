# Setup

1. **Neon database** — create a Neon project, open the SQL Editor and run `db/schema.sql`. It creates the tables, constraints, atomic functions and one contest row.
2. **Environment** — copy `.env.example` to `.env` and set `DATABASE_URL` (your Neon connection string), `ADMIN_USERNAME` and `ADMIN_PASSWORD`. `NODE_ENV` is `development` locally and `production` on Vercel.
3. **Admin login** — sign in at `/admin` with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env` (change them there and restart to rotate).
4. `npm run dev`, then open `/admin`, sign in, set title/instructions/window/timezone, and open entry access.
5. **Scheduler** — `vercel.json` calls `/api/cron/finalize` every minute (Vercel Cron needs a plan that allows per-minute crons). Writes also finalize lazily, so the deadline is enforced either way.

For an existing database, apply `db/0003_reattempt_entries.sql` before deploying this update. It preserves existing entries and makes all completed drawings eligible for judging, including previous repeat attempts.

Control **Allow reattempts** from the admin dashboard whenever needed. When disabled, any previous attempt prevents another start; active attempts keep their original deadlines.

For ranked winners, also apply `db/0004_winner_positions.sql` before deploying. The existing winner is preserved as position 1. Then apply `db/0005_shared_winner_positions.sql` to allow multiple winners at the same position. Each drawing has one editable position; adding or moving it never replaces other winners. Existing winners, their positions, and all drawings remain unchanged.
