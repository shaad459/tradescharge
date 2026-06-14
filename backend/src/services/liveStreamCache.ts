import type { LiveKiteSnapshot } from "./liveKiteSync.js";
import { applyMarkToPosition } from "./livePositionGross.js";
import { isPlausibleOptionLtp } from "./ltpPlausibility.js";
import { seedRestLtpsFromPositions } from "./kiteTickCache.js";

interface UserLiveCache {
  snapshot: LiveKiteSnapshot;
  instrumentTokens: number[];
}

const caches = new Map<string, UserLiveCache>();

export function getLiveStreamCache(userId: string): LiveKiteSnapshot | undefined {
  return caches.get(userId)?.snapshot;
}

export function setLiveStreamCache(userId: string, snapshot: LiveKiteSnapshot): number[] {
  const instrumentTokens = snapshot.positions
    .map((position) => position.instrumentToken)
    .filter((token): token is number => token != null && token > 0);

  caches.set(userId, { snapshot, instrumentTokens });
  seedRestLtpsFromPositions(userId, snapshot.positions);
  return instrumentTokens;
}

export function clearLiveStreamCache(userId: string): void {
  caches.delete(userId);
}

export function forceSyncLtpsFromRest(
  userId: string,
  ltpsByPositionId: Map<string, number>,
): LiveKiteSnapshot | undefined {
  const entry = caches.get(userId);
  if (!entry || ltpsByPositionId.size === 0) {
    return undefined;
  }

  let changed = false;
  const positions = entry.snapshot.positions.map((position) => {
    const restLtp = ltpsByPositionId.get(position.id);
    if (restLtp == null || restLtp <= 0) {
      return position;
    }
    if (position.ltp === restLtp && position.restLtp === restLtp) {
      return position;
    }
    changed = true;
    return { ...applyMarkToPosition(position, restLtp), restLtp };
  });

  if (!changed) {
    return undefined;
  }

  const snapshot = { ...entry.snapshot, positions };
  caches.set(userId, { ...entry, snapshot });
  seedRestLtpsFromPositions(userId, positions);
  return snapshot;
}

export function applyRestQuoteUpdates(
  userId: string,
  ltpsByPositionId: Map<string, number>,
): LiveKiteSnapshot | undefined {
  const entry = caches.get(userId);
  if (!entry || ltpsByPositionId.size === 0) {
    return undefined;
  }

  let changed = false;
  const positions = entry.snapshot.positions.map((position) => {
    const ltp = ltpsByPositionId.get(position.id);
    if (ltp == null || ltp <= 0 || ltp === position.ltp) {
      return position;
    }
    changed = true;
    return { ...applyMarkToPosition(position, ltp), restLtp: ltp };
  });

  if (!changed) {
    return undefined;
  }

  const snapshot = { ...entry.snapshot, positions };
  caches.set(userId, { ...entry, snapshot });
  return snapshot;
}

export function refreshRestAnchors(
  userId: string,
  ltpsByPositionId: Map<string, number>,
): LiveKiteSnapshot | undefined {
  const entry = caches.get(userId);
  if (!entry || ltpsByPositionId.size === 0) {
    return undefined;
  }

  let changed = false;
  const positions = entry.snapshot.positions.map((position) => {
    const restLtp = ltpsByPositionId.get(position.id);
    if (restLtp == null || restLtp <= 0 || restLtp === position.restLtp) {
      return position;
    }
    changed = true;
    return { ...position, restLtp };
  });

  if (!changed) {
    return undefined;
  }

  const snapshot = { ...entry.snapshot, positions };
  caches.set(userId, { ...entry, snapshot });
  seedRestLtpsFromPositions(userId, positions);
  return snapshot;
}

export function applyLiveTickUpdates(
  userId: string,
  ltpByToken: Map<number, number>,
): LiveKiteSnapshot | undefined {
  const entry = caches.get(userId);
  if (!entry || ltpByToken.size === 0) {
    return undefined;
  }

  let changed = false;
  const positions = entry.snapshot.positions.map((position) => {
    const token = position.instrumentToken;
    if (token == null) {
      return position;
    }
    const ltp = ltpByToken.get(token);
    if (ltp == null || ltp <= 0 || ltp === position.ltp) {
      return position;
    }
    if (!isPlausibleOptionLtp(position.ltp, ltp, position.restLtp)) {
      return position;
    }
    changed = true;
    return applyMarkToPosition(position, ltp);
  });

  if (!changed) {
    return undefined;
  }

  const snapshot = { ...entry.snapshot, positions };
  caches.set(userId, { ...entry, snapshot });
  return snapshot;
}
