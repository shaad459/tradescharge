const ADMIN_KEY_STORAGE = "tc_admin_key";

export interface FeedbackEntry {
  id: string;
  timestamp: string;
  visitorId: string;
  sessionId: string;
  kiteUserId?: string;
  message: string;
  rating?: number;
  contact?: string;
}

export interface AdminDashboardData {
  uniqueVisitors: number;
  repeatVisitors: number;
  demoOnlyVisitors: number;
  kiteConnectedVisitors: number;
  totalSessions: number;
  totalEvents: number;
  totalFeedback: number;
  feedbackVisitors: number;
  feedbackSessions: number;
  feedbackKiteUsers: number;
  featureUsage: Record<string, number>;
  tradingModes: { demo: number; live: number };
  recentFeedback: FeedbackEntry[];
  feedback: FeedbackEntry[];
}

export function getStoredAdminKey(): string | null {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

export function setStoredAdminKey(key: string): void {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

export function clearStoredAdminKey(): void {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

export async function fetchAdminDashboard(adminKey: string): Promise<AdminDashboardData> {
  const res = await fetch("/api/analytics/admin/dashboard", {
    headers: { Authorization: `Bearer ${adminKey}` },
  });

  const body = (await res.json().catch(() => ({}))) as AdminDashboardData & { error?: string };

  if (res.status === 503) {
    throw new Error(body.error ?? "Admin dashboard is not configured on the server.");
  }
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to load admin dashboard");
  }

  return body;
}
