import Nav from "@/components/Nav";
import Sparkline from "@/components/Sparkline";
import WeekPicker from "@/components/WeekPicker";
import { store } from "@/lib/store";
import type { Metric, MetricKey, WeekData } from "@/lib/types";

export const dynamic = "force-dynamic";

type Format = "number" | "percent" | "money" | "roas";
type Dir = "up" | "down" | "neutral";

const METRIC_CONFIG: {
  key: MetricKey;
  label: string;
  format: Format;
  dir: Dir;
  sources?: boolean;
}[] = [
  { key: "totalVisitors", label: "Website Visitors", format: "number", dir: "up", sources: true },
  { key: "conversionRate", label: "Booking Conversion Rate", format: "percent", dir: "up" },
  { key: "googleAdsSpend", label: "Google Ads Spend", format: "money", dir: "neutral" },
  { key: "metaAdsSpend", label: "Meta Ads Spend", format: "money", dir: "neutral" },
  { key: "costPerBooking", label: "Cost Per Booking", format: "money", dir: "down" },
  { key: "totalBookingValue", label: "Total Booking Value", format: "money", dir: "up", sources: true },
  { key: "roas", label: "ROAS", format: "roas", dir: "up" },
];

const SOURCE_LABELS: Record<string, string> = {
  googleAds: "Google Ads", metaAds: "Meta Ads", organic: "Organic", direct: "Direct",
  "(direct)": "Direct", "(none)": "Direct", google: "Google", facebook: "Facebook",
  instagram: "Instagram", social: "Social", hs_sms: "HubSpot SMS", bing: "Bing",
};
const humanSource = (k: string) =>
  SOURCE_LABELS[k] ?? k.replace(/[()]/g, "").split(".")[0].replace(/^\w/, (c) => c.toUpperCase());

function fmt(value: number | undefined, kind: Format): string {
  if (value == null || !isFinite(value)) return "—";
  switch (kind) {
    case "money": return "$" + Math.round(value).toLocaleString("en-US");
    case "percent": return (value * 100).toFixed(2) + "%";
    case "roas": return value.toFixed(2) + "x";
    default: return Math.round(value).toLocaleString("en-US");
  }
}

function pctDelta(cur: number, prior: number): number | null {
  if (!prior || !isFinite(prior)) return null;
  return (cur - prior) / prior;
}

function deltaClass(delta: number | null, dir: Dir): string {
  if (delta === null || Math.abs(delta) < 0.005 || dir === "neutral") return "flat";
  const improving = (dir === "up" && delta > 0) || (dir === "down" && delta < 0);
  return improving ? "good" : "bad";
}

function deltaText(delta: number | null): string {
  if (delta === null) return "—";
  const pct = delta * 100;
  return (pct > 0 ? "↑ +" : pct < 0 ? "↓ " : "→ ") + pct.toFixed(1) + "%";
}

function fmtRange(start: string, end: string): string {
  const d = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  return `${d(start)} – ${d(end)}`;
}

function Card({ cfg, metric }: { cfg: (typeof METRIC_CONFIG)[number]; metric?: Metric }) {
  const wow = metric ? pctDelta(metric.current, metric.prior) : null;
  const yoy = metric ? pctDelta(metric.current, metric.priorYear) : null;
  return (
    <div className="kpi-card">
      <div className="kpi-label">{cfg.label}</div>
      <div className="kpi-value">{fmt(metric?.current, cfg.format)}</div>
      <div className="kpi-deltas">
        <span className="delta">
          <span className={deltaClass(wow, cfg.dir)}>{deltaText(wow)}</span> <span style={{ opacity: 0.55 }}>vs last week</span>
        </span>
        <span className="delta">
          <span className={deltaClass(yoy, cfg.dir)}>{deltaText(yoy)}</span> <span style={{ opacity: 0.55 }}>YoY</span>
        </span>
      </div>
      {cfg.sources && metric?.bySource && (
        <div className="kpi-sources">
          {Object.entries(metric.bySource)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([k, v]) => (
              <div className="src-row" key={k}>
                <span>{humanSource(k)}</span>
                <span>{fmt(v, cfg.format === "money" ? "money" : "number")}</span>
              </div>
            ))}
        </div>
      )}
      {metric?.history && <Sparkline points={metric.history} />}
    </div>
  );
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const index = await store.getMarketingIndex();
  const active = week && index.weeks.some((w) => w.weekOf === week) ? week : index.latest;
  const data: WeekData | null = await store.getMarketingWeek(active);

  return (
    <>
      <header className="hero">
        <div className="hero-inner">
          <div className="eyebrow">Bolt Farm Treehouse</div>
          <h1>
            Weekly Marketing <em>Report</em>
          </h1>
          <p className="hero-subtitle">
            {data ? `Week of ${fmtRange(data.weekOf.start, data.weekOf.end)}` : "No data available"}
          </p>
          <WeekPicker weeks={index.weeks} active={active} />
        </div>
      </header>
      <Nav />
      <main className="container">
        {data ? (
          <div className="grid">
            {METRIC_CONFIG.map((cfg) => (
              <Card key={cfg.key} cfg={cfg} metric={data.metrics[cfg.key]} />
            ))}
          </div>
        ) : (
          <p>Could not load week {active}.</p>
        )}
        <footer className="footer">
          <span>
            Last updated{" "}
            {data
              ? new Date(data.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
              : "—"}
          </span>
          <span className="footer-sep">·</span>
          <span>Sources: GA4, Google Ads, Meta Ads (via Windsor.ai) · bookings entered manually</span>
        </footer>
      </main>
    </>
  );
}
