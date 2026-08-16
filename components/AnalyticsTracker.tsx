"use client";

import { useEffect, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type CollectPayload = {
  event: "session_start" | "page_view" | "heartbeat";
  visitorId: string;
  sessionId: string;
  userId?: string | null;
  ts: number;
  page: { path: string; title?: string; referrer?: string | null };
  utm?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
  };
  device?: {
    type?: string | null;
    os?: string | null;
    browser?: string | null;
    screen?: string | null;
    lang?: string | null;
  };
  engagement?: { activeSeconds?: number };
};

const VISITOR_KEY = "boe_vid";
const SESSION_KEY = "boe_sid";
const LAST_ACTIVITY_KEY = "boe_last_activity";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min GA-like
// One row per active visitor every 10 seconds becomes 10,000 writes/second at
// 100k concurrency. A five-minute default keeps engagement useful while
// reducing analytics write pressure by 30x; production can tune it if needed.
const configuredHeartbeatSeconds = Number(
  process.env.NEXT_PUBLIC_ANALYTICS_HEARTBEAT_SECONDS,
);
const HEARTBEAT_SEC = Number.isFinite(configuredHeartbeatSeconds)
  ? Math.max(60, Math.min(300, Math.floor(configuredHeartbeatSeconds)))
  : 300;

// ✅ exclude these pages from analytics (no count, no show)
const EXCLUDED_PATH_PREFIXES = ["/auth/signin", "/auth/signup", "/admin"];
function isExcludedPath(pathname: string | null | undefined) {
  if (!pathname) return false;
  return EXCLUDED_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

type CryptoCapableGlobal = typeof globalThis & {
  crypto?: Crypto;
};

function uuid(): string {
  const c = (globalThis as CryptoCapableGlobal).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOrCreateVisitorId() {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const id = uuid();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return uuid();
  }
}

function getOrCreateSessionId(forceNew = false) {
  try {
    if (forceNew) {
      const sid = uuid();
      sessionStorage.setItem(SESSION_KEY, sid);
      return sid;
    }
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const sid = uuid();
    sessionStorage.setItem(SESSION_KEY, sid);
    return sid;
  } catch {
    return uuid();
  }
}

function getUTM(searchParams: URLSearchParams) {
  const source = searchParams.get("utm_source");
  const medium = searchParams.get("utm_medium");
  const campaign = searchParams.get("utm_campaign");
  return { source, medium, campaign };
}

function getDeviceInfo() {
  const ua = navigator.userAgent || "";
  const lang = navigator.language || "";
  const screen = `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`;

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  const deviceType = isMobile ? "mobile" : "desktop";

  let os = "Unknown";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Unknown";
  if (/Edg/i.test(ua)) browser = "Edge";
  else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Firefox/i.test(ua)) browser = "Firefox";

  return { type: deviceType, os, browser, screen, lang };
}

async function send(payload: CollectPayload) {
  try {
    await fetch("/api/analytics/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      cache: "no-store",
    });
  } catch {
    // ignore
  }
}

function AnalyticsTrackerContent({
  userId,
}: {
  userId?: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const visitorIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lastHeartbeatAtRef = useRef<number>(0);
  const isActiveRef = useRef<boolean>(true);

  // init ids + session rules
  useEffect(() => {
    // ✅ block excluded paths
    if (isExcludedPath(pathname)) return;

    const vid = getOrCreateVisitorId();
    visitorIdRef.current = vid;

    const now = Date.now();
    const last = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || "0");
    const expired = !last || now - last > SESSION_TIMEOUT_MS;

    const sid = getOrCreateSessionId(expired);
    sessionIdRef.current = sid;

    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(now));

    if (expired) {
      void send({
        event: "session_start",
        visitorId: vid,
        sessionId: sid,
        userId: userId ?? null,
        ts: now,
        page: {
          path: pathname || "/",
          title: document.title,
          referrer: document.referrer || null,
        },
        utm: getUTM(new URLSearchParams(window.location.search)),
        device: getDeviceInfo(),
      });
    }
  }, [userId, pathname]);

  // page_view on route change
  useEffect(() => {
    // ✅ block excluded paths
    if (isExcludedPath(pathname)) return;

    const vid = visitorIdRef.current || getOrCreateVisitorId();
    const sid = sessionIdRef.current || getOrCreateSessionId(false);
    const now = Date.now();

    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(now));

    void send({
      event: "page_view",
      visitorId: vid,
      sessionId: sid,
      userId: userId ?? null,
      ts: now,
      page: {
        path:
          (pathname || "/") +
          (searchParams?.toString() ? `?${searchParams.toString()}` : ""),
        title: document.title,
        referrer: document.referrer || null,
      },
      utm: getUTM(new URLSearchParams(window.location.search)),
      device: getDeviceInfo(),
    });
  }, [pathname, searchParams, userId]);

  // activity listeners
  useEffect(() => {
    const markActive = () => {
      isActiveRef.current = true;
      sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    };
    const markInactive = () => {
      isActiveRef.current = false;
    };

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];
    events.forEach((e) =>
      window.addEventListener(e, markActive, { passive: true })
    );

    const onVis = () => {
      if (document.hidden) markInactive();
      else markActive();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      events.forEach((e) => window.removeEventListener(e, markActive));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // heartbeat loop (GA-like engagement)
  useEffect(() => {
    const tick = () => {
      // ✅ block excluded paths (no heartbeat, no session_start)
      if (isExcludedPath(pathname)) return;

      const now = Date.now();
      const last = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || "0");
      const expired = !last || now - last > SESSION_TIMEOUT_MS;

      if (expired) {
        const sid = getOrCreateSessionId(true);
        sessionIdRef.current = sid;
        sessionStorage.setItem(LAST_ACTIVITY_KEY, String(now));

        void send({
          event: "session_start",
          visitorId: visitorIdRef.current || getOrCreateVisitorId(),
          sessionId: sid,
          userId: userId ?? null,
          ts: now,
          page: {
            path: pathname || "/",
            title: document.title,
            referrer: document.referrer || null,
          },
          utm: getUTM(new URLSearchParams(window.location.search)),
          device: getDeviceInfo(),
        });
      }

      const visible = !document.hidden;
      const active = isActiveRef.current;

      if (visible && active) {
        if (now - lastHeartbeatAtRef.current >= HEARTBEAT_SEC * 1000) {
          lastHeartbeatAtRef.current = now;

          void send({
            event: "heartbeat",
            visitorId: visitorIdRef.current || getOrCreateVisitorId(),
            sessionId: sessionIdRef.current || getOrCreateSessionId(false),
            userId: userId ?? null,
            ts: now,
            page: {
              path: pathname || "/",
              title: document.title,
              referrer: document.referrer || null,
            },
            utm: getUTM(new URLSearchParams(window.location.search)),
            device: getDeviceInfo(),
            engagement: { activeSeconds: HEARTBEAT_SEC },
          });
        }
      }
    };

    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [pathname, userId]);

  return null;
}

export default function AnalyticsTracker(props: { userId?: string | null }) {
  return (
    <Suspense fallback={null}>
      <AnalyticsTrackerContent {...props} />
    </Suspense>
  );
}
