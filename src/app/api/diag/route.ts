import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

// Temporary diagnostic — guarded by CRON_SECRET. Reports what the runtime sees
// for the Windsor key (prefix/suffix only) and what Windsor returns to the function.
export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.WINDSOR_API_KEY || "";
  const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let windsor = "n/a";
  try {
    const r = await fetch(
      `https://connectors.windsor.ai/googleanalytics4?api_key=${key}&date_from=${day}&date_to=${day}&fields=default_channel_group,sessions&_renderer=json`,
      { cache: "no-store" }
    );
    windsor = (await r.text()).slice(0, 220);
  } catch (e) {
    windsor = "ERR " + (e as Error).message;
  }
  return NextResponse.json({
    keyLen: key.length,
    keyPrefix: key.slice(0, 6),
    keySuffix: key.slice(-4),
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    windsor,
  });
}
