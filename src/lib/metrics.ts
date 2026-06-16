import type { ManualWeekInput, Metric, WeekData } from "./types";

/**
 * Overlay manually-entered numbers onto an auto-pulled (or seed) week.
 *
 * Auto pipeline (Windsor.ai) supplies: totalVisitors, googleAdsSpend, metaAdsSpend.
 * The human supplies the rest via /admin: bookings, totalBookingValue.
 * Booking Conversion Rate, Cost Per Booking, and ROAS are then *derived* so they never drift.
 */
export function applyManual(base: WeekData, manual?: ManualWeekInput | null): WeekData {
  // Deep-ish clone so we never mutate stored/seed objects.
  const out: WeekData = JSON.parse(JSON.stringify(base));
  if (!manual) return out;

  const setCurrent = (m: Metric | undefined, value: number): Metric => {
    const metric: Metric = m ?? { current: 0, prior: 0, priorYear: 0, history: [] };
    metric.current = value;
    // Keep the latest history point in sync with the override so sparklines match.
    const weekOf = out.weekOf.start;
    const last = metric.history[metric.history.length - 1];
    if (last && last.week === weekOf) last.value = value;
    return metric;
  };

  const adSpend =
    (out.metrics.googleAdsSpend?.current ?? 0) + (out.metrics.metaAdsSpend?.current ?? 0);

  if (manual.totalBookingValue != null) {
    out.metrics.totalBookingValue = setCurrent(out.metrics.totalBookingValue, manual.totalBookingValue);
  }
  if (manual.bookings != null && manual.bookings > 0) {
    out.metrics.costPerBooking = setCurrent(out.metrics.costPerBooking, adSpend / manual.bookings);
  }
  // Booking conversion rate = bookings ÷ website visitors.
  const visitors = out.metrics.totalVisitors?.current ?? 0;
  if (manual.bookings != null && visitors > 0) {
    out.metrics.conversionRate = setCurrent(out.metrics.conversionRate, manual.bookings / visitors);
  }

  // ROAS always derived from (possibly overridden) booking value vs ad spend.
  const bookingValue = out.metrics.totalBookingValue?.current ?? 0;
  if (adSpend > 0) {
    out.metrics.roas = setCurrent(out.metrics.roas, bookingValue / adSpend);
  }

  return out;
}

/** Pull the human-editable values back out of a composed week, for prefilling /admin. */
export function manualFromWeek(week: WeekData): ManualWeekInput {
  const adSpend =
    (week.metrics.googleAdsSpend?.current ?? 0) + (week.metrics.metaAdsSpend?.current ?? 0);
  const cpb = week.metrics.costPerBooking?.current ?? 0;
  return {
    weekOf: week.weekOf.start,
    bookings: cpb > 0 ? Math.round(adSpend / cpb) : null,
    totalBookingValue: week.metrics.totalBookingValue?.current ?? null,
  };
}
