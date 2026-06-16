import Nav from "@/components/Nav";
import { adminEnabled, isAuthed } from "@/lib/auth";
import { manualFromWeek } from "@/lib/metrics";
import { store } from "@/lib/store";
import type { ManualWeekInput } from "@/lib/types";
import { loginAction, logoutAction, saveManualAction } from "./actions";

export const dynamic = "force-dynamic";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <header className="hero">
        <div className="hero-inner">
          <div className="eyebrow">Bolt Farm Treehouse</div>
          <h1>
            Dashboard <em>Admin</em>
          </h1>
          <p className="hero-subtitle">{title}</p>
        </div>
      </header>
      <Nav />
      <main className="container">{children}</main>
    </>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; saved?: string; err?: string }>;
}) {
  const { week, saved, err } = await searchParams;

  if (!adminEnabled()) {
    return (
      <Shell title="Setup required">
        <div className="card">
          <p>
            The admin form is disabled because <code>ADMIN_PASSWORD</code> is not set. Add it to your environment
            (locally in <code>.env.local</code>, in production via Vercel → Settings → Environment Variables) and redeploy.
          </p>
        </div>
      </Shell>
    );
  }

  if (!(await isAuthed())) {
    return (
      <Shell title="Sign in to edit manual data">
        {err === "bad-password" && <div className="notice err">Incorrect password.</div>}
        <form action={loginAction} className="admin-form">
          <div className="admin-field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="admin-input" autoFocus required />
          </div>
          <button className="btn-gold" type="submit">Sign in</button>
        </form>
      </Shell>
    );
  }

  const index = await store.getMarketingIndex();
  const active = week && index.weeks.some((w) => w.weekOf === week) ? week : index.latest;
  const stored = await store.getManualInput(active);
  const composed = await store.getMarketingWeek(active);
  // Prefill: stored manual values win; otherwise derive from the composed/seed week.
  const prefill: ManualWeekInput = stored ?? (composed ? manualFromWeek(composed) : { weekOf: active });

  return (
    <Shell title="Enter the numbers that can’t be pulled automatically">
      {saved && <div className="notice ok">Saved. The weekly report now reflects these numbers.</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-label">Choose week</div>
        <form method="GET" style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
          <select name="week" defaultValue={active} className="admin-select">
            {[...index.weeks].reverse().map((w) => (
              <option key={w.weekOf} value={w.weekOf}>
                Week of {w.start}
              </option>
            ))}
          </select>
          <button className="btn-gold" type="submit" style={{ padding: "9px 20px" }}>Load</button>
        </form>
      </div>

      <div className="card">
        <div className="section-label">Manual data · week of {active}</div>
        <p style={{ fontSize: 13, opacity: 0.7, margin: "6px 0 20px" }}>
          Visitors and ad spend are pulled automatically from Windsor.ai (GA4, Google Ads, Meta Ads).
          Booking&nbsp;Conversion&nbsp;Rate, Cost&nbsp;Per&nbsp;Booking, and ROAS are derived from the values below — you don’t enter them directly.
        </p>
        <form action={saveManualAction} className="admin-form">
          <input type="hidden" name="weekOf" value={active} />

          <div className="admin-field">
            <label htmlFor="bookings">Bookings (count)</label>
            <span className="hint">Number of confirmed bookings this week. Used to compute Cost Per Booking.</span>
            <input id="bookings" name="bookings" type="number" step="1" min="0" className="admin-input" defaultValue={prefill.bookings ?? ""} />
          </div>

          <div className="admin-field">
            <label htmlFor="totalBookingValue">Total Booking Value ($)</label>
            <span className="hint">Total revenue booked this week. Used for Total Booking Value and ROAS.</span>
            <input id="totalBookingValue" name="totalBookingValue" type="number" step="0.01" min="0" className="admin-input" defaultValue={prefill.totalBookingValue ?? ""} />
          </div>

          <div className="admin-field">
            <label htmlFor="notes">Notes (optional)</label>
            <input id="notes" name="notes" type="text" className="admin-input" defaultValue={stored?.notes ?? ""} />
          </div>

          <button className="btn-gold" type="submit">Save week</button>
        </form>
      </div>

      <form action={logoutAction} style={{ marginTop: 24 }}>
        <button type="submit" style={{ background: "none", border: "none", color: "var(--sienna)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
          Sign out
        </button>
      </form>
    </Shell>
  );
}
