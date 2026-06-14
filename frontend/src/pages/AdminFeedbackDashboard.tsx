import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearStoredAdminKey,
  fetchAdminDashboard,
  getStoredAdminKey,
  setStoredAdminKey,
  type AdminDashboardData,
  type FeedbackEntry,
} from "../api/adminAnalytics";
import { formatIstDateTime } from "../utils/datetime";
import { getOrCreateVisitorId } from "../utils/analytics";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="admin-stat-card">
      <span className="admin-stat-label">{label}</span>
      <strong className="admin-stat-value">{value}</strong>
    </div>
  );
}

function RatingStars({ rating }: { rating?: number }) {
  if (rating == null) {
    return <span className="admin-muted">—</span>;
  }
  return <span className="admin-rating">{rating} / 5</span>;
}

export function AdminFeedbackDashboard() {
  const [adminKey, setAdminKey] = useState(getStoredAdminKey() ?? "");
  const [keyInput, setKeyInput] = useState("");
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(Boolean(getStoredAdminKey()));

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchAdminDashboard(key);
      setData(payload);
      setStoredAdminKey(key);
      setAdminKey(key);
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setAuthenticated(false);
      clearStoredAdminKey();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminKey) {
      void load(adminKey);
    }
  }, [adminKey, load]);

  const filteredFeedback = useMemo(() => {
    if (!data) {
      return [];
    }
    const q = search.trim().toLowerCase();
    if (!q) {
      return data.feedback;
    }
    return data.feedback.filter(
      (row) =>
        row.message.toLowerCase().includes(q) ||
        row.contact?.toLowerCase().includes(q) ||
        row.sessionId.toLowerCase().includes(q) ||
        row.visitorId.toLowerCase().includes(q) ||
        row.kiteUserId?.toLowerCase().includes(q),
    );
  }, [data, search]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const key = keyInput.trim();
    if (!key) {
      return;
    }
    void load(key);
  }

  function handleLogout() {
    clearStoredAdminKey();
    setAdminKey("");
    setKeyInput("");
    setData(null);
    setAuthenticated(false);
    setError(null);
  }

  function exportJson() {
    if (!data) {
      return;
    }
    const blob = new Blob([JSON.stringify(data.feedback, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tradescharge-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!authenticated) {
    return (
      <div className="admin-page">
        <div className="admin-login-card">
          <h1>Admin — Feedback</h1>
          <p className="admin-muted">
            Enter your <code>ANALYTICS_ADMIN_KEY</code> from the backend <code>.env</code>. Only you
            should have this key.
          </p>
          <form onSubmit={handleLogin}>
            <label>
              Admin key
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="From ANALYTICS_ADMIN_KEY in .env"
                autoComplete="off"
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={loading || !keyInput.trim()}>
              {loading ? "Checking…" : "Unlock dashboard"}
            </button>
          </form>
          {error && <p className="admin-error">{error}</p>}
          <a href="/" className="admin-back-link">
            ← Back to Tradescharge
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1>Feedback dashboard</h1>
          <p className="admin-muted">Local analytics from backend/data/analytics.json</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load(adminKey)}>
            Refresh
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportJson} disabled={!data?.feedback.length}>
            Export JSON
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
            Lock
          </button>
          <a href="/" className="btn btn-secondary btn-sm">
            App
          </a>
        </div>
      </header>

      {loading && !data && <p className="admin-muted">Loading…</p>}
      {error && <p className="admin-error">{error}</p>}

      {data && (
        <>
          <section className="admin-callout">
            <p className="admin-browser-id">
              This browser&apos;s visitor ID:{" "}
              <code>{getOrCreateVisitorId()}</code>
            </p>
            <p>
              <strong>Why 12 visitors but only you?</strong> Old tracking created a new visitor
              whenever cookies cleared, you used another browser, or the backend issued a new{" "}
              <code>tc_vid</code> cookie. Sessions also reset on every tab (sessionStorage). Events
              count every click (tabs, charts, etc.) — 860 is normal for a day of dev. Use the{" "}
              <strong>Feedback IDs</strong> row below for reliable identity on submissions.
            </p>
          </section>

          <section className="admin-stats">
            <StatCard label="Feedback items" value={data.totalFeedback} />
            <StatCard label="Feedback visitors" value={data.feedbackVisitors} />
            <StatCard label="Feedback sessions" value={data.feedbackSessions} />
            <StatCard label="Feedback Kite users" value={data.feedbackKiteUsers} />
          </section>

          <section className="admin-stats admin-stats-secondary">
            <StatCard label="All visitors (events)" value={data.uniqueVisitors} />
            <StatCard label="All sessions (events)" value={data.totalSessions} />
            <StatCard label="Kite logins (events)" value={data.kiteConnectedVisitors} />
            <StatCard label="All events" value={data.totalEvents} />
          </section>

          {Object.keys(data.featureUsage).length > 0 && (
            <section className="admin-panel">
              <h2>Feature usage</h2>
              <ul className="admin-feature-list">
                {Object.entries(data.featureUsage)
                  .sort((a, b) => b[1] - a[1])
                  .map(([feature, count]) => (
                    <li key={feature}>
                      <span>{feature}</span>
                      <strong>{count}</strong>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <section className="admin-panel">
            <div className="admin-panel-head">
              <h2>All feedback ({filteredFeedback.length})</h2>
              <input
                type="search"
                className="admin-search"
                placeholder="Search message, visitor, session, Kite id…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {filteredFeedback.length === 0 ? (
              <p className="admin-muted">No feedback yet.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>When (IST)</th>
                      <th>Rating</th>
                      <th>Message</th>
                      <th>Contact</th>
                      <th>Kite user</th>
                      <th>Visitor ID</th>
                      <th>Session ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFeedback.map((row: FeedbackEntry) => (
                      <tr key={row.id}>
                        <td className="admin-cell-time">{formatIstDateTime(row.timestamp)}</td>
                        <td>
                          <RatingStars rating={row.rating} />
                        </td>
                        <td className="admin-cell-message">{row.message}</td>
                        <td>{row.contact ?? "—"}</td>
                        <td className="admin-cell-mono">{row.kiteUserId ?? "—"}</td>
                        <td className="admin-cell-mono admin-cell-id" title={row.visitorId}>
                          {row.visitorId}
                        </td>
                        <td className="admin-cell-mono admin-cell-id" title={row.sessionId}>
                          {row.sessionId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
