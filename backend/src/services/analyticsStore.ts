import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const STORE_PATH = path.join(DATA_DIR, "analytics.json");
const MAX_EVENTS = 50_000;
const MAX_FEEDBACK = 2_000;

export type AnalyticsEventName =
  | "session_start"
  | "landing_view"
  | "demo_entered"
  | "kite_login_success"
  | "kite_login_failed"
  | "kite_logout"
  | "trading_mode"
  | "feature_used"
  | "order_placed"
  | "feedback_submitted";

export interface AnalyticsEvent {
  id: string;
  timestamp: string;
  visitorId: string;
  sessionId: string;
  event: AnalyticsEventName | string;
  properties?: Record<string, string | number | boolean>;
}

export interface FeedbackEntry {
  id: string;
  timestamp: string;
  visitorId: string;
  sessionId: string;
  /** Zerodha client id when logged in at submit time */
  kiteUserId?: string;
  message: string;
  rating?: number;
  contact?: string;
}

interface AnalyticsStore {
  events: AnalyticsEvent[];
  feedback: FeedbackEntry[];
}

function ensureStore(): AnalyticsStore {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const empty: AnalyticsStore = { events: [], feedback: [] };
    fs.writeFileSync(STORE_PATH, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as AnalyticsStore;
    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    };
  } catch {
    return { events: [], feedback: [] };
  }
}

function saveStore(store: AnalyticsStore) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function newVisitorId(): string {
  return crypto.randomUUID();
}

export function recordEvents(events: Omit<AnalyticsEvent, "id" | "timestamp">[]) {
  if (events.length === 0) {
    return;
  }
  const store = ensureStore();
  const now = new Date().toISOString();
  for (const event of events) {
    store.events.push({
      ...event,
      id: crypto.randomUUID(),
      timestamp: now,
    });
  }
  if (store.events.length > MAX_EVENTS) {
    store.events = store.events.slice(-MAX_EVENTS);
  }
  saveStore(store);
}

export function recordFeedback(entry: Omit<FeedbackEntry, "id" | "timestamp">) {
  const store = ensureStore();
  store.feedback.push({
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  });
  if (store.feedback.length > MAX_FEEDBACK) {
    store.feedback = store.feedback.slice(-MAX_FEEDBACK);
  }
  saveStore(store);
}

export interface AnalyticsSummary {
  uniqueVisitors: number;
  repeatVisitors: number;
  demoOnlyVisitors: number;
  kiteConnectedVisitors: number;
  totalSessions: number;
  totalEvents: number;
  totalFeedback: number;
  /** Distinct visitorId on feedback rows only */
  feedbackVisitors: number;
  /** Distinct sessionId on feedback rows only */
  feedbackSessions: number;
  /** Distinct kiteUserId on feedback (when provided) */
  feedbackKiteUsers: number;
  featureUsage: Record<string, number>;
  tradingModes: { demo: number; live: number };
  recentFeedback: FeedbackEntry[];
}

export function getAllFeedback(): FeedbackEntry[] {
  const store = ensureStore();
  return [...store.feedback].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export function getAdminDashboardPayload(): AnalyticsSummary & { feedback: FeedbackEntry[] } {
  const summary = getAnalyticsSummary();
  return {
    ...summary,
    feedback: getAllFeedback(),
  };
}

export function getAnalyticsSummary(): AnalyticsSummary {
  const store = ensureStore();
  const visitorSessions = new Map<string, Set<string>>();
  const visitorDays = new Map<string, Set<string>>();
  const visitorsWithKite = new Set<string>();
  const visitorsWithDemo = new Set<string>();
  const featureUsage: Record<string, number> = {};
  let demoModeCount = 0;
  let liveModeCount = 0;

  for (const event of store.events) {
    if (!visitorSessions.has(event.visitorId)) {
      visitorSessions.set(event.visitorId, new Set());
    }
    visitorSessions.get(event.visitorId)!.add(event.sessionId);

    const day = event.timestamp.slice(0, 10);
    if (!visitorDays.has(event.visitorId)) {
      visitorDays.set(event.visitorId, new Set());
    }
    visitorDays.get(event.visitorId)!.add(day);

    if (event.event === "kite_login_success") {
      visitorsWithKite.add(event.visitorId);
    }
    if (event.event === "demo_entered") {
      visitorsWithDemo.add(event.visitorId);
    }
    if (event.event === "feature_used" && event.properties?.feature) {
      const key = String(event.properties.feature);
      featureUsage[key] = (featureUsage[key] ?? 0) + 1;
    }
    if (event.event === "trading_mode" && event.properties?.mode) {
      if (event.properties.mode === "demo") {
        demoModeCount += 1;
      }
      if (event.properties.mode === "live") {
        liveModeCount += 1;
      }
    }
  }

  let repeatVisitors = 0;
  for (const [visitorId, sessions] of visitorSessions) {
    const days = visitorDays.get(visitorId)?.size ?? 0;
    if (sessions.size > 1 || days > 1) {
      repeatVisitors += 1;
    }
  }

  const demoOnlyVisitors = [...visitorsWithDemo].filter((id) => !visitorsWithKite.has(id)).length;
  const allSessions = new Set(store.events.map((e) => e.sessionId));

  const feedbackVisitorIds = new Set(store.feedback.map((f) => f.visitorId));
  const feedbackSessionIds = new Set(store.feedback.map((f) => f.sessionId));
  const feedbackKiteUserIds = new Set(
    store.feedback.map((f) => f.kiteUserId).filter((id): id is string => Boolean(id)),
  );

  return {
    uniqueVisitors: visitorSessions.size,
    repeatVisitors,
    demoOnlyVisitors,
    kiteConnectedVisitors: visitorsWithKite.size,
    totalSessions: allSessions.size,
    totalEvents: store.events.length,
    totalFeedback: store.feedback.length,
    feedbackVisitors: feedbackVisitorIds.size,
    feedbackSessions: feedbackSessionIds.size,
    feedbackKiteUsers: feedbackKiteUserIds.size,
    featureUsage,
    tradingModes: { demo: demoModeCount, live: liveModeCount },
    recentFeedback: store.feedback.slice(-20).reverse(),
  };
}
