# Bolt Farm Treehouse — Marketing Analytics Dashboard

A stable, auto-updating replacement for the two hand-maintained Netlify dashboards
([weekly marketing report](https://boltfarm-marketing-dashboard.netlify.app/) and
[traffic analytics](https://boltfarm.netlify.app/traffic-analytics/)), rebuilt as one
Next.js app on Vercel.

- **`/`** — Weekly Marketing Report (visitors, leads, conversion, ad spend, cost/booking, booking value, ROAS)
- **`/traffic`** — Traffic Analytics (yesterday, 30-day, daily trend, by-channel, comparisons, insights)
- **`/admin`** — password-protected form for the numbers that can't be pulled automatically

Data auto-refreshes on a schedule; manual numbers are entered in the admin form; the two are
merged at render time.

## How data flows

```
Windsor.ai (GA4 + Google Ads + Meta Ads) ──► cron jobs ─► base data ─┐
                                              (weekly/daily)          ├─► merged ─► dashboards
Admin form (bookings, total booking value) ─────────────────────────►┘
                                              (Conversion Rate, Cost/Booking & ROAS are derived)
```

| Metric | Source |
|---|---|
| Website Visitors (+ by source) | GA4 via Windsor.ai |
| Google / Meta Ads Spend | Windsor.ai |
| Bookings, Total Booking Value | **manual** (admin form) |
| Booking Conversion Rate | **derived** (bookings ÷ visitors) |
| Cost Per Booking, ROAS | **derived** from the above |
| All traffic-analytics data | GA4 via Windsor.ai |

## Storage

- **Production:** Postgres (Neon, via the Vercel Marketplace). Set `DATABASE_URL`.
- **No DB set:** the app runs read-only from the committed seed snapshots in
  `src/data/seed/` (real data from the old dashboards), and the admin form writes to local
  files under `data/store/` — fine for local dev, not for production.

## Local development

```bash
npm install
cp .env.example .env.local   # set ADMIN_PASSWORD at minimum
npm run dev                  # http://localhost:3000
```

With no `DATABASE_URL`, you immediately get the dashboards populated from seed data, and the
admin form persists to `data/store/` locally.

## Deploy to Vercel

1. Push this repo to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. **Add a database:** Vercel project → Storage → Marketplace → **Neon** (Postgres). This sets
   `DATABASE_URL` automatically.
3. **Set environment variables** (Project → Settings → Environment Variables) — see `.env.example`:
   - `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`
   - `CRON_SECRET` (generate with `openssl rand -hex 32`)
   - `WINDSOR_API_KEY`
4. **Seed the database** with the historical weeks (once): `npm run seed:db` locally with
   `DATABASE_URL` in `.env.local`, or hit the backfill endpoints (below).
5. Deploy. The cron jobs in `vercel.json` run automatically:
   - `/api/cron/traffic` — daily at 11:00 UTC (~6 AM Central)
   - `/api/cron/marketing` — Mondays at 12:00 UTC

## Connecting the live data sources

The connector field mappings use Windsor.ai's GA4 defaults. To wire your account:

1. **Windsor.ai** — get your API key (windsor.ai → API). Confirm the connector slugs for GA4,
   Google Ads, and Meta match `WINDSOR_*_CONNECTOR` in `.env.example`. If Windsor renamed any
   fields for your account, adjust the `F` map in [`src/lib/windsor.ts`](src/lib/windsor.ts) once
   (open a connector URL with `&fields=...` to see exact keys).
2. **Test a pull** (replace the secret):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/cron/traffic
   curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>.vercel.app/api/cron/marketing?week=2026-05-11"
   ```
   The `?week=` param backfills a specific week.

## Project layout

```
src/
  app/
    page.tsx                 Weekly Marketing Report
    traffic/page.tsx         Traffic Analytics
    admin/                   Auth + manual-data form (server actions)
    api/
      marketing|traffic/     JSON read endpoints
      cron/marketing|traffic/  Scheduled pulls (CRON_SECRET-protected)
  components/                Nav, WeekPicker, Sparkline, TrafficCharts
  lib/
    store.ts                 Postgres / file+seed adapter
    windsor.ts               Windsor.ai connector (GA4 + Google/Meta Ads)
    marketing-pipeline.ts    Weekly assembly
    metrics.ts               Manual overlay + derivations
    types.ts, auth.ts, traffic-utils.ts
  data/seed/                 Real historical snapshots (seed)
scripts/seed-db.mjs          Load seed → Postgres
vercel.json                  Cron schedules
```

Styling follows the Bolt Farm Treehouse brand standards (Ovo serif, forest-green palette).
