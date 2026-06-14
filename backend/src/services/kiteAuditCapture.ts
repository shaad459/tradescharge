import { fetchLiveKiteSnapshot } from "./liveKiteSync.js";
import { getActiveSessionUserIds, getSession } from "./kite.js";
import { restorePersistedSessions } from "./sessionManager.js";
import { kiteAuditStatus } from "./kiteAuditLog.js";

export async function captureKiteAuditForUser(
  userId: string,
  source = "auto-capture",
): Promise<{ ok: boolean; userId: string; error?: string }> {
  const session = getSession(userId);
  if (!session?.accessToken) {
    return { ok: false, userId, error: "No active Kite session" };
  }

  try {
    await fetchLiveKiteSnapshot(session.accessToken, {
      userId,
      source,
      force: true,
    });
    return { ok: true, userId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Capture failed";
    return { ok: false, userId, error: message };
  }
}

export async function captureAllKiteAudits(source = "auto-capture"): Promise<
  Array<{ ok: boolean; userId: string; error?: string }>
> {
  const userIds = getActiveSessionUserIds();
  if (userIds.length === 0) {
    return [];
  }

  return Promise.all(userIds.map((userId) => captureKiteAuditForUser(userId, source)));
}

export async function bootstrapKiteSessionsAndCapture(): Promise<void> {
  const restored = await restorePersistedSessions();
  if (restored.length === 0) {
    return;
  }

  console.log(`Restored ${restored.length} Kite session(s): ${restored.join(", ")}`);
  const results = await captureAllKiteAudits("startup-capture");
  for (const result of results) {
    if (result.ok) {
      const status = await kiteAuditStatus(result.userId);
      console.log(
        `Kite audit captured for ${result.userId} → ${status.todayLineCount} snapshot(s) today`,
      );
    } else {
      console.warn(`Kite audit capture skipped (${result.userId}): ${result.error}`);
    }
  }
}
