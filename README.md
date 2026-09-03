# bolt-marketing-dashboard

**Owner:** Tim Gerst, Marketing Director
**Backup owner:** Keagan Luttrell, Tech Director
**Status:** active

> Status note: `active` is the answer of record (Keagan, 2026-09-01) — the dashboard is in use by
> the marketing team. The repo's own evidence reads colder than that: the README is written as
> *instructions for someone about to deploy it*, and the last **Production** Vercel deployment
> recorded on GitHub is **2026-06-18** (previews continued to 2026-08-12). The status is
> authoritative; the deployment gap is just a quiet repo.

## What is this?

A stable, auto-updating marketing analytics dashboard for Bolt Farm Treehouse, built as one
Next.js app on Vercel to replace two hand-maintained Netlify dashboards (the
[weekly marketing report](https://boltfarm-marketing-dashboard.netlify.app/) and
[traffic analytics](https://boltfarm.netlify.app/traffic-analytics/)). Three surfaces:

- `/` — Weekly Marketing Report: visitors, leads, conversion, ad spend, cost per booking, booking
  value, ROAS.
- `/traffic` — Traffic Analytics: yesterday, 30-day, daily trend, by-channel, comparisons,
  insights.
- `/admin` — password-protected form for the numbers that cannot be pulled automatically.

GA4, Google Ads and Meta Ads data arrive from Windsor.ai on cron; bookings and total booking value
are entered by hand in the admin form; conversion rate, cost per booking and ROAS are derived. The
two sources are merged at render time. Audience: the Bolt Farm marketing team and leadership.

## Run it locally

```bash
npm install
cp .env.example .env.local   # set ADMIN_PASSWORD at minimum
npm run dev                  # http://localhost:3000
```

Prereqs: Node with npm (no engine pinned in `package.json`; the repo uses `package-lock.json`).
With no `DATABASE_URL`, the app runs read-only from the committed seed snapshots in
`src/data/seed/` and the admin form persists to local files under `data/store/` — fine for local
dev, not for production. Seed a real database once with `npm run seed:db` while `DATABASE_URL` is
in `.env.local`, or hit the backfill endpoints.

## Where it deploys

- **Production:** Vercel project `bolt-marketing-dashboard` on team `boltfarm`
  (Vercel team slug also appears as `bolt-farm`). GitHub records Production deployments, the most
  recent on **2026-06-18**; previews continued through 2026-08-12.
- **Staging:** none. Vercel preview deployments per push.
- **Deploy mechanism:** Vercel Git integration — push auto-deploys. First-time setup per the
  README: import at vercel.com/new → Storage → Marketplace → Neon (sets `DATABASE_URL`
  automatically) → set env vars → seed.
- **Crons** (`vercel.json`):
  | Path | Schedule |
  |---|---|
  | `/api/cron/traffic` | daily 11:00 UTC (~06:00 Central) |
  | `/api/cron/marketing` | Mondays 12:00 UTC |
- **Logs / dashboards:** Vercel dashboard → project `bolt-marketing-dashboard` → Logs and Cron
  history; Neon console for the database; windsor.ai for the connectors.
- **Canonical URL:** the repo does not record a custom domain or stable alias; the current
  production URL is the one shown for the project in the Vercel dashboard.

## Critical dependencies & secrets

**Depends on:**

- **Vercel** (team `boltfarm`) — hosting, Git deploys, and the two crons.
- **Neon Postgres** (Vercel Marketplace) — production persistence. Without `DATABASE_URL` the app
  degrades to read-only committed seed data.
- **Windsor.ai** — the single data source for GA4, Google Ads and Meta Ads. Connector slugs are
  configurable: `WINDSOR_GA4_CONNECTOR` (`googleanalytics4`), `WINDSOR_GOOGLEADS_CONNECTOR`
  (`google_ads`), `WINDSOR_META_CONNECTOR` (`facebook`). Website Visitors counts only the GA4
  hostname in `WINDSOR_PRIMARY_HOSTNAME` (`www.boltfarmtreehouse.com`), and Meta campaigns whose
  name contains any of `WINDSOR_META_EXCLUDE_CAMPAIGNS` (`coaching,thrive`) are excluded from
  spend.
- **Chart.js** for rendering. No other third-party services.

**Secrets stored in:** **Vercel project environment variables** (Project → Settings →
Environment Variables), mirrored locally in a git-ignored `.env.local`.
[`.env.example`](./.env.example) is the complete inventory and ships placeholder values only
(`ADMIN_PASSWORD=change-me`, `ADMIN_SESSION_SECRET=change-me-to-a-long-random-string`). Names:
`DATABASE_URL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `CRON_SECRET` (generate with
`openssl rand -hex 32`; Vercel sends it as `Authorization: Bearer <CRON_SECRET>`), and
`WINDSOR_API_KEY`.

Held by **Tim Gerst, Marketing Director** (answer of record, 2026-09-01): the **Windsor.ai
account and its API key** (`WINDSOR_API_KEY`) and the `/admin` **`ADMIN_PASSWORD`**. These are
Tim's, not Keagan's — ask Tim to read, change or rotate either.
