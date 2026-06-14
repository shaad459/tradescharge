/** Limits concurrent outbound Kite/history calls so boot + chain + technicals do not pile up. */

const MAX_CONCURRENT = 3;
let inFlight = 0;
const waitQueue: Array<() => void> = [];

function releaseSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
  const next = waitQueue.shift();
  if (next) {
    next();
  }
}

export async function withKiteRequestSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waitQueue.push(resolve));
  }
  inFlight += 1;
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}
