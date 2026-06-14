import { Router } from "express";
import {
  getAdminDashboardPayload,
  getAnalyticsSummary,
  recordEvents,
  recordFeedback,
  type AnalyticsEventName,
} from "../services/analyticsStore.js";
import { requireCsrf } from "../middleware/csrf.js";
import { requireAdminKey } from "../middleware/requireAdminKey.js";
import { resolveVisitorId } from "../utils/analyticsIdentity.js";
import { reconcileStaleSession } from "../services/kite.js";

export const analyticsRouter = Router();

analyticsRouter.post("/events", requireCsrf, (req, res) => {
  const body = req.body as {
    sessionId?: string;
    visitorId?: string;
    events?: Array<{ event: string; properties?: Record<string, string | number | boolean> }>;
  };
  const visitorId = resolveVisitorId(req, res, body.visitorId);

  if (!body.sessionId || !Array.isArray(body.events) || body.events.length === 0) {
    return res.status(400).json({ error: "sessionId and events[] are required" });
  }

  if (body.events.length > 25) {
    return res.status(400).json({ error: "Too many events in one batch" });
  }

  recordEvents(
    body.events.map((item) => ({
      visitorId,
      sessionId: body.sessionId!,
      event: item.event as AnalyticsEventName,
      properties: item.properties,
    })),
  );

  res.json({ ok: true, visitorId });
});

analyticsRouter.post("/feedback", requireCsrf, (req, res) => {
  const body = req.body as {
    sessionId?: string;
    visitorId?: string;
    kiteUserId?: string;
    message?: string;
    rating?: number;
    contact?: string;
  };
  const visitorId = resolveVisitorId(req, res, body.visitorId);
  const kiteUserId = reconcileStaleSession(req, res);

  const message = body.message?.trim();
  if (!body.sessionId || !message || message.length < 3) {
    return res.status(400).json({ error: "sessionId and message (min 3 chars) are required" });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: "Message too long" });
  }

  const submittedKiteUserId =
    typeof body.kiteUserId === "string" && body.kiteUserId.length > 0
      ? body.kiteUserId.slice(0, 32)
      : kiteUserId;

  recordFeedback({
    visitorId,
    sessionId: body.sessionId,
    kiteUserId: submittedKiteUserId,
    message,
    rating:
      body.rating !== undefined && Number.isFinite(body.rating)
        ? Math.min(5, Math.max(1, Math.round(body.rating)))
        : undefined,
    contact: body.contact?.trim().slice(0, 120),
  });

  recordEvents([
    {
      visitorId,
      sessionId: body.sessionId,
      event: "feedback_submitted",
      properties: { hasRating: body.rating != null, hasContact: Boolean(body.contact?.trim()) },
    },
  ]);

  res.json({ ok: true });
});

/** Legacy summary endpoint (same payload as /admin/dashboard summary fields). */
analyticsRouter.get("/summary", requireAdminKey, (req, res) => {
  res.json(getAnalyticsSummary());
});

/** Admin-only: usage summary + full feedback list. */
analyticsRouter.get("/admin/dashboard", requireAdminKey, (_req, res) => {
  res.json(getAdminDashboardPayload());
});
