import type { ChannelRow, DailyPoint, TrafficData } from "./types";

/**
 * Windsor.ai connector.
 *
 * Windsor exposes a single REST endpoint per data source:
 *   https://connectors.windsor.ai/<connector>?api_key=...&date_from=YYYY-MM-DD&date_to=...&fields=...
 * It returns { data: [ { <field>: value, ... }, ... ] }.
 *
 * The field names below are Windsor's GA4 defaults. If your Windsor account
 * renames fields, adjust the FIELD_* maps once and everything downstream works.
 * Tip: hit the URL once in a browser with &fields=... to see the exact keys.
 */
const BASE = "https://connectors.windsor.ai";

const GA4 = process.env.WINDSOR_GA4_CONNECTOR || "googleanalytics4";
const GOOGLE_ADS = process.env.WINDSOR_GOOGLEADS_CONNECTOR || "google_ads";
const META = process.env.WINDSOR_META_CONNECTOR || "facebook";

// GA4 field names in Windsor (adjust here if your account differs).
const F = {
  date: "date",
  channel: "default_channel_group", // GA4 "Default channel group"
  source: "source",
  sessions: "sessions",
  users: "active_users",
  bounceRate: "bounce_rate", // 0..1
  avgDuration: "average_session_duration", // seconds
  engagementRate: "engagement_rate", // 0..1
  spend: "spend",
};

function requireKey(): string {
  const key = process.env.WINDSOR_API_KEY;
  if (!key) throw new Error("WINDSOR_API_KEY is not set");
  return key;
}

type Row = Record<string, string | number | null>;

async function windsorFetch(connector: string, params: { from: string; to: string; fields: string[] }): Promise<Row[]> {
  const url = new URL(`${BASE}/${connector}`);
  url.searchParams.set("api_key", requireKey());
  url.searchParams.set("date_from", params.from);
  url.searchParams.set("date_to", params.to);
  url.searchParams.set("fields", params.fields.join(","));
  url.searchParams.set("_renderer", "json");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Windsor ${connector} → HTTP ${res.status}`);
  const json = (await res.json()) as { data?: Row[] };
  return json.data ?? [];
}

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return Number.isFinite(n as number) ? (n as number) : 0;
};

/** Aggregate GA4 rows into ChannelRow[] keyed by channel group, session-weighting the rates. */
function aggregateChannels(rows: Row[]): ChannelRow[] {
  const map = new Map<string, ChannelRow & { _bw: number; _dw: number; _ew: number }>();
  for (const r of rows) {
    const name = String(r[F.channel] ?? "Unassigned");
    const sessions = num(r[F.sessions]);
    const cur = map.get(name) ?? {
      name, sessions: 0, users: 0, bounce: 0, duration: 0, engagement: 0, _bw: 0, _dw: 0, _ew: 0,
    };
    cur.sessions += sessions;
    cur.users += num(r[F.users]);
    cur._bw += num(r[F.bounceRate]) * sessions;
    cur._dw += num(r[F.avgDuration]) * sessions;
    cur._ew += num(r[F.engagementRate]) * sessions;
    map.set(name, cur);
  }
  return [...map.values()]
    .map((c) => ({
      name: c.name,
      sessions: c.sessions,
      users: c.users,
      bounce: c.sessions ? c._bw / c.sessions : 0,
      duration: c.sessions ? c._dw / c.sessions : 0,
      engagement: c.sessions ? c._ew / c.sessions : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

function ga4Fields(withDate: boolean) {
  const f = [F.channel, F.sessions, F.users, F.bounceRate, F.avgDuration, F.engagementRate];
  return withDate ? [F.date, ...f] : f;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const MMMD = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Build the full traffic dashboard payload from GA4 (yesterday, last 7d, last 30d, daily trend). */
export async function fetchTrafficData(today = new Date()): Promise<TrafficData> {
  const day = (offset: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + offset);
    return isoDate(d);
  };
  const yesterday = day(-1);
  const weekStart = day(-7);
  const monthStart = day(-30);

  const [ydayRows, weekRows, monthRows, dailyRows] = await Promise.all([
    windsorFetch(GA4, { from: yesterday, to: yesterday, fields: ga4Fields(false) }),
    windsorFetch(GA4, { from: weekStart, to: yesterday, fields: ga4Fields(false) }),
    windsorFetch(GA4, { from: monthStart, to: yesterday, fields: ga4Fields(false) }),
    windsorFetch(GA4, { from: monthStart, to: yesterday, fields: [F.date, F.sessions, F.users] }),
  ]);

  const dailyMap = new Map<string, DailyPoint>();
  for (const r of dailyRows) {
    const iso = String(r[F.date]).slice(0, 10);
    const cur = dailyMap.get(iso) ?? { date: MMMD(iso), sessions: 0, users: 0 };
    cur.sessions += num(r[F.sessions]);
    cur.users += num(r[F.users]);
    dailyMap.set(iso, cur);
  }
  const daily = [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);

  return {
    generatedAt: new Date().toISOString(),
    yesterdayDate: new Date(yesterday + "T00:00:00Z").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
    }),
    rangeLabel: `${MMMD(monthStart)} – ${MMMD(yesterday)}`,
    yesterday: aggregateChannels(ydayRows),
    week: aggregateChannels(weekRows),
    channel: aggregateChannels(monthRows),
    daily,
  };
}

/** GA4 visitors for a week, with a by-source breakdown. */
export async function fetchVisitors(from: string, to: string): Promise<{ total: number; bySource: Record<string, number> }> {
  const rows = await windsorFetch(GA4, { from, to, fields: [F.source, F.sessions] });
  const bySource: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const s = num(r[F.sessions]);
    total += s;
    const src = String(r[F.source] ?? "(direct)");
    bySource[src] = (bySource[src] ?? 0) + s;
  }
  return { total, bySource };
}

/** Total ad spend for a connector (google_ads / facebook) over a date range. */
export async function fetchAdSpend(connector: "google" | "meta", from: string, to: string): Promise<number> {
  const c = connector === "google" ? GOOGLE_ADS : META;
  const rows = await windsorFetch(c, { from, to, fields: [F.spend] });
  return rows.reduce((sum, r) => sum + num(r[F.spend]), 0);
}
