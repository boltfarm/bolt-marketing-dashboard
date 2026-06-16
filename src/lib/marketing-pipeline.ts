import { store } from "./store";
import type { Metric, MetricKey, MetricPoint, WeekData } from "./types";
import { fetchAdSpend, fetchVisitors } from "./windsor";

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday of the week containing `d` (UTC). */
export function mondayOf(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (out.getUTCDay() + 6) % 7; // Mon=0
  out.setUTCDate(out.getUTCDate() - dow);
  return out;
}

/** Most recent fully-completed Mon–Sun week as of `today`. */
export function lastCompleteWeekStart(today = new Date()): string {
  return iso(new Date(mondayOf(today).getTime() - 7 * DAY));
}

function buildHistory(prior: WeekData[], key: MetricKey, currentWeek: string, currentValue: number): MetricPoint[] {
  const hist = prior
    .map((w) => ({ week: w.weekOf.start, value: w.metrics[key]?.current ?? 0 }))
    .slice(-7);
  hist.push({ week: currentWeek, value: currentValue });
  return hist;
}

/**
 * Pull all auto-sourced metrics for one week and assemble a base WeekData
 * (prior / priorYear / history pulled from previously-stored weeks).
 * Manual fields (bookings, booking value, Olive) are layered on at read time.
 */
export async function assembleMarketingWeek(weekStart: string): Promise<WeekData> {
  const start = new Date(weekStart + "T00:00:00Z");
  const endDate = new Date(start.getTime() + 6 * DAY);
  const end = iso(endDate);

  const [visitors, googleSpend, metaSpend] = await Promise.all([
    fetchVisitors(weekStart, end),
    fetchAdSpend("google", weekStart, end),
    fetchAdSpend("meta", weekStart, end),
  ]);

  // Prior-week and prior-year reference values from storage.
  const priorWeekStart = iso(new Date(start.getTime() - 7 * DAY));
  const priorYearStart = iso(new Date(start.getTime() - 364 * DAY));
  const index = await store.getMarketingIndex();
  const priorWeeks: WeekData[] = [];
  for (const e of index.weeks) {
    if (e.weekOf < weekStart) {
      const w = await store.getMarketingWeek(e.weekOf);
      if (w) priorWeeks.push(w);
    }
  }
  const priorWeek = priorWeeks.find((w) => w.weekOf.start === priorWeekStart);
  const priorYear = priorWeeks.find((w) => w.weekOf.start === priorYearStart);

  const make = (key: MetricKey, current: number, bySource?: Record<string, number>): Metric => ({
    current,
    prior: priorWeek?.metrics[key]?.current ?? 0,
    priorYear: priorYear?.metrics[key]?.current ?? 0,
    history: buildHistory(priorWeeks, key, weekStart, current),
    ...(bySource ? { bySource } : {}),
  });

  const metrics: WeekData["metrics"] = {
    totalVisitors: make("totalVisitors", visitors.total, visitors.bySource),
    // Booking conversion rate is derived from manual bookings ÷ visitors in applyManual().
    conversionRate: make("conversionRate", 0),
    googleAdsSpend: make("googleAdsSpend", googleSpend),
    metaAdsSpend: make("metaAdsSpend", metaSpend),
  };

  return { generatedAt: new Date().toISOString(), weekOf: { start: weekStart, end }, metrics };
}
