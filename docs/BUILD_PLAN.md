# Bolt Media Dashboard — Build Plan

## Context

Bolt Farm Treehouse currently produces social reporting by hand. The goal is a **standalone live dashboard** (GitHub → Vercel) that auto-refreshes all owned social accounts and answers four questions weekly: what content is working, where each platform is trending vs. its own baseline, what competitors are breaking out, and how social contributes to leads/bookings in BoltOS. Repo: `BoltFarm/Bolt-Media-Dashboard` (empty). Vercel is linked once files land.

The core design principle from the spec: **ingestion and attribution are independent** — metrics must always land even when creator/BoltOS matching misses, and a failed pull must show a stale/failed state with last-successful-sync time, never zeros.

### Confirmed decisions (from research + user)
- **Owned social ingestion → Windsor.ai** ("Windsor now, native later"). The account `marketingboltfarmtreehousecom` is already provisioned; Google Ads + GA4 are live. `instagram`, `facebook_organic`, `tiktok_organic`, `youtube` are valid connectors needing per-account authorization. This replaces building 7 native OAuth apps.
- **Competitors → Meta Graph Business Discovery (free, via our own IG token) + Apify IG scraper fallback** for accounts Business Discovery can't reach.
- **Database → Neon Postgres** (Vercel Marketplace).
- **BoltOS → API available now**; ingest social-attributed inquiries/reservations directly.
- **GA4** (already connected via Windsor) supplies the sessions/leads layer for Social Conversion.

---

## Architecture

```
                     ┌────────────── Vercel (Next.js App Router) ──────────────┐
Sources              │  Scheduled ingestion (Vercel Cron → /api/ingest/*)      │
─────────            │   each connector = independent job, own status row      │
Windsor.ai  ──REST──▶│   ┌─────────────┐                                       │
  IG/FB/TT/YT/GA4    │   │ ingestion   │──writes──▶ Neon Postgres (snapshots,  │
Meta Graph  ──REST──▶│   │ + normalize │            posts, competitors, GA4,   │
  (Business Disc.)   │   └─────────────┘            boltos, tasks, matches)    │
Apify       ──REST──▶│   ┌─────────────┐                                       │
BoltOS API  ──REST──▶│   │ attribution │◀─reads posts+tasks (runs AFTER        │
ClickUp API ──REST──▶│   │  matcher    │  ingestion, never blocks it)          │
                     │   └─────────────┘                                       │
                     │  Dashboard (RSC) ──reads ONLY Postgres, never live APIs──│
                     └─────────────────────────────────────────────────────────┘
```

- **Stack:** Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, Recharts for trends, Drizzle ORM over Neon. Fluid Compute functions (Node 24). Deploy via GitHub → Vercel.
- **Config:** `vercel.ts` for cron schedules + function config (not `vercel.json`).
- **Rule enforced everywhere:** the dashboard reads stored rows; ingestion is the only thing that touches live APIs. Every connector job writes an `ingestion_run` row (status, last_success_at, error) so the UI can render stale/failed instead of zeros.

---

## Data model (Neon Postgres)

Immutable daily snapshots + post-level records + attribution kept separate.

| Table | Purpose | Key columns |
|---|---|---|
| `account` | owned + competitor account registry | id, platform, handle, kind (`owned`/`competitor`), windsor_account_id, is_personal_brand |
| `daily_snapshot` | **immutable** per-account per-day metrics | account_id, date, reach, qualified_reach, saves, shares, likes, comments, video_views, avg_watch_time, followers, follower_delta, profile_visits, link_clicks, publishing_count, source, ingested_at |
| `post` | owned post-level records | id, account_id, platform, media_id, permalink, published_at, thumbnail_url, caption, is_short (YT inference), likes, comments, shares, saves, reach, video_views, watch_time, engagement_rate |
| `competitor_post` | public competitor posts | id, account_id, media_id, permalink, published_at, thumbnail_url, caption, likes, comments, is_breakout, engagement_vs_30d_avg |
| `ga4_social` | GA4 social sessions/leads | date, source, medium, channel, sessions, key_events, new_users |
| `boltos_attribution` | social→lead/booking (source of truth) | date, source, inquiries, qualified, reservations, revenue_cents |
| `clickup_task` | planned social tasks | task_id, content_id, owner_id, owner_name, platform, published_post_url, platform_media_id, status |
| `attribution_match` | post ↔ task links | post_id, task_id, method (`media_id`/`url`/`window_meta`/`caption`), confidence, status (`matched`/`unattributed`) |
| `ingestion_run` | per-connector health | connector, account_id, status, started_at, last_success_at, error, rows_written |
| `target` | configurable cadence targets | account_id/platform, weekly_target |

Baselines are computed from `daily_snapshot` (trailing 4–8 week rolling window per account), not stored denormalized.

---

## Connectors & how we pull each

### 1. Owned social — Windsor.ai REST API
- **Connect:** Tim authorizes each owned account once at `https://onboard.windsor.ai?datasource=<slug>` — `instagram` (Bolt Farm, Seth, Tori), `facebook_organic`, `tiktok_organic`, `youtube` (main + Shorts share the YouTube connector). Confirms insights access for Seth/Tori IG.
- **Pull:** nightly Vercel Cron → Windsor REST `get_data` per connector/account with a Windsor API key stored in Vercel env. Discover exact field IDs per connector with Windsor `get_fields` **after** connect (field availability differs per platform — do not hardcode).
- **Metrics mapped:** reach, saves, shares, likes, comments, video_views, avg_watch_time/retention (where present), followers → `follower_delta`, publishing volume, profile_visits, link_clicks. Derived: `qualified_reach = (saves+shares)/reach`, `engagement_rate = (likes+comments+shares+saves)/reach`.
- **YouTube Shorts:** one YouTube connector; infer Short by duration ≤60s / vertical aspect / `#shorts` → set `post.is_short`, split main vs Shorts in reporting.
- **Independence:** each connector = its own `/api/ingest/<connector>` route + `ingestion_run` row; one failing (e.g. TikTok token) never blocks the others.

### 2. Competitors — Meta Graph Business Discovery + Apify fallback
- **Primary:** Meta Graph API `business_discovery` on our owned IG Business account token: `?fields=business_discovery.username(<handle>){followers_count,media_count,media{id,timestamp,like_count,comments_count,caption,permalink,media_url,media_type}}`. Free; returns likes+comments+followers only (no reach/saves/shares — matches the constraint).
- **Fallback:** accounts Business Discovery can't resolve (personal profiles) → Apify Instagram scraper (paid per run) for the same public fields.
- **Breakout flag:** `engagement = likes + comments`; compute each account's rolling 30-day average; flag `is_breakout` when a post is `>3×` that average. Store `engagement_vs_30d_avg`.
- **Handles in scope:** blackberry.mountain, blackberryfarm, loxleyforest, treehouseutopi, menizei, hinataretreat, ulumresorts, aman, soneva.

### 3. Social conversion — GA4 (Windsor) + BoltOS API
- **GA4 (already connected):** Windsor `googleanalytics4` → date, source, medium, sessions, conversions (key events), new/total users; filter to social source/medium → `ga4_social`. Confirmed available.
- **BoltOS (API available):** nightly pull of social-attributed inquiries → qualified → reservations + revenue into `boltos_attribution`. BoltOS is the **source of truth for bookings**; GA4 covers the top of funnel (sessions/leads). Store BoltOS key + base URL in Vercel env. Money is integer cents.

### 4. Creator attribution — ClickUp API
- **Connect:** ClickUp API token in Vercel env. Ensure a `content_id` custom field exists on planned social tasks (plus optional `platform`, `published_post_url`, `platform_media_id`); task **owner** is the creator.
- **Pull:** sync social-list tasks + custom fields + owner into `clickup_task`.
- **Fallback matcher (runs after ingestion, order is strict):**
  1. exact platform media ID → 2. exact permalink/URL → 3. platform + publish window + metadata → 4. caption similarity (last-resort assist only).
- **Confidence gate:** below threshold → write `attribution_match.status='unattributed'` and surface in an **exception queue** UI. Never guess. Creator rollup groups matched posts by ClickUp owner.

---

## Dashboard sections (read from Postgres only)
1. **Weekly Health Check** — per owned account: reach, qualified_reach, engagement_rate, net follower growth vs. own trailing baseline (▲/▼ deltas).
2. **Platform Comparison** — trend direction per platform vs. its recent baseline.
3. **Top 10 Posts** — thumbnail, account, date, permalink, ranking metrics.
4. **Seth vs Tori** — side-by-side personal-brand performance.
5. **Publishing Cadence vs Targets** — actual weekly output vs. configurable `target` rows.
6. **Competition** — weekly top competitor posts + breakout flags (>3× 30-day avg).
7. **Social Conversion** — GA4 sessions/leads + BoltOS bookings/revenue attributed to social.
8. **Creator Attribution** — performance grouped by ClickUp task owner + exception queue for unattributed.

Every card shows a freshness badge (last_success_at); stale/failed connectors render an explicit state, not zeros. UI stays simple, fast, decision-oriented; content shown beside performance.

---

## Build order
1. **Foundation:** Next.js + Neon + Drizzle schema; `ingestion_run` + status plumbing; Windsor client. **First connector (Bolt Farm IG) end-to-end → Weekly Health Check.**
2. **Remaining owned connectors** (FB, TikTok, YouTube main+Shorts, Seth IG, Tori IG) + baselines.
3. **Top 10 Posts + Platform Comparison + Cadence vs Targets.**
4. **Competitor tracking** (Business Discovery → Apify fallback) + breakout flags.
5. **Social Conversion** (GA4 + BoltOS).
6. **Creator attribution** (ClickUp sync + fallback matcher + exception queue).

Each phase deploys to a Vercel preview; ship incrementally.

---

## Critical files (to create)
- `vercel.ts` — cron schedules + Fluid Compute config.
- `db/schema.ts` — Drizzle tables above; `db/client.ts` — Neon connection.
- `lib/windsor.ts`, `lib/metaGraph.ts`, `lib/apify.ts`, `lib/boltos.ts`, `lib/clickup.ts` — source clients w/ retry, rate-limit, token-refresh, logging.
- `lib/ingest/runner.ts` — wraps every job in an `ingestion_run` record (independent failure).
- `lib/attribution/matcher.ts` — 4-step ordered matcher + confidence gate.
- `lib/metrics.ts` — qualified_reach, engagement_rate, baselines, breakout math, Shorts inference.
- `app/api/ingest/[connector]/route.ts` — one route per connector.
- `app/api/ingest/attribution/route.ts` — post-ingestion matcher pass.
- `app/(dashboard)/…` — the 8 sections as RSC pages reading Postgres.
- `.env` keys: `WINDSOR_API_KEY`, `META_GRAPH_TOKEN`, `APIFY_TOKEN`, `BOLTOS_API_KEY`+`BOLTOS_BASE_URL`, `CLICKUP_TOKEN`, `DATABASE_URL` (managed via `vercel env`).

---

## Verification
- **Per connector:** hit `/api/ingest/<connector>` manually; assert `ingestion_run.status='success'`, `rows_written>0`, and rows in `daily_snapshot`/`post`. Kill a token to confirm the UI shows stale + last_success_at (not zeros) and other connectors still succeed.
- **Metrics:** spot-check qualified_reach/engagement_rate against Windsor `get_data`; validate a known Short flips `is_short`.
- **Competitors:** confirm Business Discovery returns for ≥1 handle, Apify covers a personal-profile handle, and a seeded >3× post flags `is_breakout`.
- **Attribution:** seed a ClickUp task with `content_id` + matching `platform_media_id`; confirm `method='media_id'` match; seed a no-match post → confirm `unattributed` + appears in exception queue.
- **Conversion:** cross-check GA4 social sessions vs. Windsor `googleanalytics4`; verify BoltOS revenue in cents renders correctly.
- **E2E:** run full cron cycle on a Vercel preview; confirm all 8 sections populate and freshness badges are correct.

## Open dependencies (resolve during build, non-blocking to plan)
- Tim authorizes all 7 owned accounts in Windsor (gates phases 1–2).
- Windsor subscription tier confirmed (field availability per platform verified post-connect).
- BoltOS API base URL + key + the social-attribution query shape.
- ClickUp `content_id` custom field created on the social task list.
