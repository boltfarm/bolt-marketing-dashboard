// ── Marketing weekly report ──────────────────────────────────
export type MetricPoint = { week: string; value: number };

export type Metric = {
  current: number;
  prior: number;
  priorYear: number;
  history: MetricPoint[];
  bySource?: Record<string, number>;
};

// The 7 (+ leads) metric keys rendered by the weekly report.
export type MetricKey =
  | "totalVisitors"
  | "conversionRate"
  | "googleAdsSpend"
  | "metaAdsSpend"
  | "costPerBooking"
  | "totalBookingValue"
  | "roas";

export type WeekData = {
  generatedAt: string;
  weekOf: { start: string; end: string };
  metrics: Partial<Record<MetricKey, Metric>>;
};

export type WeekIndexEntry = { weekOf: string; start: string; end: string };
export type WeekIndex = { weeks: WeekIndexEntry[]; latest: string };

// Fields a human enters in /admin that cannot be auto-pulled.
export type ManualWeekInput = {
  weekOf: string;
  bookings?: number | null; // # of bookings → drives Cost Per Booking + Conversion Rate
  totalBookingValue?: number | null; // $ → drives Total Booking Value + ROAS
  notes?: string;
  updatedAt?: string;
};

// ── Traffic analytics ────────────────────────────────────────
export type ChannelRow = {
  name: string;
  sessions: number;
  users: number;
  bounce: number; // 0..1
  duration: number; // seconds
  engagement: number; // 0..1
};

export type DailyPoint = { date: string; sessions: number; users: number };

export type TrafficData = {
  generatedAt: string;
  yesterdayDate: string;
  rangeLabel: string;
  yesterday: ChannelRow[];
  week: ChannelRow[];
  channel: ChannelRow[];
  daily: DailyPoint[];
};
