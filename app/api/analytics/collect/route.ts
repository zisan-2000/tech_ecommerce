import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function safeStr(v: unknown, max = 500) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function getDayKeyUTC(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function isLocalOrPrivateIp(ip: string) {
  const s = ip.toLowerCase();
  return (
    s === "::1" ||
    s.startsWith("127.") ||
    s.startsWith("10.") ||
    s.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(s)
  );
}

// ✅ pages you never want to track
const EXCLUDED_PATH_PREFIXES = ["/auth/signin", "/auth/signup", "/admin"];

type AnalyticsEventType = "session_start" | "page_view" | "heartbeat";

function isAnalyticsEventType(value: string | null): value is AnalyticsEventType {
  return value === "session_start" || value === "page_view" || value === "heartbeat";
}

type GeoLookupResponse = {
  status?: string;
  message?: string;
  country?: string;
  city?: string;
  regionName?: string;
  lat?: number;
  lon?: number;
  isp?: string;
  query?: string;
};

async function geoLookup(ip: string) {
  const cached = await prisma.geoIpCache.findUnique({ where: { ip } });
  if (cached) return cached;

  const fields = [
    "status",
    "message",
    "country",
    "city",
    "regionName",
    "lat",
    "lon",
    "isp",
    "query",
  ].join(",");

  const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${encodeURIComponent(
    fields
  )}`;

  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json()) as GeoLookupResponse;

  if (json?.status !== "success") return null;

  const created = await prisma.geoIpCache.create({
    data: {
      ip,
      country: typeof json.country === "string" ? json.country : null,
      city: typeof json.city === "string" ? json.city : null,
      region: typeof json.regionName === "string" ? json.regionName : null,
      lat: typeof json.lat === "number" ? json.lat : null,
      lon: typeof json.lon === "number" ? json.lon : null,
      isp: typeof json.isp === "string" ? json.isp : null,
    },
  });

  return created;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const eventRaw = safeStr(body?.event, 50);
    if (!isAnalyticsEventType(eventRaw)) {
      return NextResponse.json(
        { ok: false, error: "Invalid event" },
        { status: 400 }
      );
    }
    const event = eventRaw;

    const visitorId = safeStr(body?.visitorId, 100);
    const sessionId = safeStr(body?.sessionId, 100);
    if (!visitorId || !sessionId) {
      return NextResponse.json(
        { ok: false, error: "Missing ids" },
        { status: 400 }
      );
    }

    const tsNum = typeof body?.ts === "number" ? body.ts : Date.now();
    const ts = new Date(tsNum);
    const dayKey = getDayKeyUTC(ts);

    const path = safeStr(body?.page?.path, 1000) ?? "/";

    // ✅ hard block excluded pages (no store, no count)
    if (EXCLUDED_PATH_PREFIXES.some((p) => path.startsWith(p))) {
      return NextResponse.json({ ok: true });
    }

    const title = safeStr(body?.page?.title, 300);
    const referrer = safeStr(body?.page?.referrer, 1000);

    const utmSource = safeStr(body?.utm?.source, 120);
    const utmMedium = safeStr(body?.utm?.medium, 120);
    const utmCampaign = safeStr(body?.utm?.campaign, 120);

    const deviceType = safeStr(body?.device?.type, 50);
    const browser = safeStr(body?.device?.browser, 80);
    const os = safeStr(body?.device?.os, 80);
    const screen = safeStr(body?.device?.screen, 50);
    const lang = safeStr(body?.device?.lang, 30);

    const activeSeconds =
      event === "heartbeat" && typeof body?.engagement?.activeSeconds === "number"
        ? Math.max(0, Math.min(300, Math.floor(body.engagement.activeSeconds)))
        : 0;

    const userId = safeStr(body?.userId, 100);

    // ✅ compute ipHash for daily unique visitors
    const ip = getClientIp(req);
    const salt = process.env.ANALYTICS_IP_SALT || "boe-default-salt";
    const ipHash = ip ? sha256(`${salt}:${ip}`) : null;

    // ✅ Geo only for page_view/session_start (NOT heartbeat)
    let country: string | null = null;
    let city: string | null = null;

    if (event !== "heartbeat") {
      if (ip && !isLocalOrPrivateIp(ip)) {
        const geo = await geoLookup(ip);
        country = geo?.country ?? null;
        city = geo?.city ?? null;
      }
    }

    await prisma.analyticsEvent.create({
      data: {
        ts,
        dayKey,
        ipHash,
        event,
        visitorId,
        sessionId,
        userId: userId ?? null,
        path,
        title,
        referrer,
        utmSource,
        utmMedium,
        utmCampaign,
        deviceType,
        browser,
        os,
        screen,
        lang,
        activeSeconds,
        country,
        city,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
