import { postAnalyticsEvents, postFeedback } from "../api/client";

const SESSION_KEY = "tc_analytics_session";
const VISITOR_KEY = "tc_visitor_id";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type FeatureName =
  | "positions_open_tab"
  | "positions_closed_tab"
  | "positions_executed_tab"
  | "position_add"
  | "position_exit"
  | "closed_reentry"
  | "order_pad"
  | "order_placed"
  | "account_menu"
  | "pnl_chart"
  | "theme_toggle";

function randomId(): string {
  return crypto.randomUUID();
}

/** Stable per-browser device id (survives tab close; stored in localStorage). */
export function getOrCreateVisitorId(): string {
  let visitorId = localStorage.getItem(VISITOR_KEY);
  if (!visitorId) {
    visitorId = randomId();
    localStorage.setItem(VISITOR_KEY, visitorId);
  }
  return visitorId;
}

/** Reuse session for 8h so refreshes don't inflate session counts. */
export function getSessionId(): string {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; startedAt: number };
      if (parsed.id && now - parsed.startedAt < SESSION_TTL_MS) {
        return parsed.id;
      }
    }
  } catch {
    // fall through
  }
  const id = randomId();
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id, startedAt: now }));
  return id;
}

export function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean>,
) {
  const visitorId = getOrCreateVisitorId();
  postAnalyticsEvents(getSessionId(), [{ event, properties }], visitorId)
    .then((result) => {
      if (result.visitorId && result.visitorId !== visitorId) {
        localStorage.setItem(VISITOR_KEY, result.visitorId);
      }
    })
    .catch(() => {
      // Non-blocking — analytics must not break trading flows
    });
}

export function trackFeature(feature: FeatureName, extra?: Record<string, string | number | boolean>) {
  trackEvent("feature_used", { feature, ...extra });
}

export function submitFeedback(input: {
  message: string;
  rating?: number;
  contact?: string;
  kiteUserId?: string;
}) {
  return postFeedback({
    sessionId: getSessionId(),
    visitorId: getOrCreateVisitorId(),
    kiteUserId: input.kiteUserId,
    ...input,
  });
}

export function initAnalyticsSession() {
  trackEvent("session_start", {
    path: window.location.pathname,
    referrer: document.referrer ? "external" : "direct",
    visitorId: getOrCreateVisitorId(),
  });
}
