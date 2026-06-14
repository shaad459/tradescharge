import type { Position } from "../types.js";
import { NIFTY_LOT_SIZE } from "../constants.js";

export const mockPositions: Position[] = [
  {
    id: "1",
    symbol: "NIFTY",
    instrumentType: "CE",
    strike: 24500,
    expiry: "2025-05-29",
    side: "long",
    buyPrice: 142.5,
    quantity: NIFTY_LOT_SIZE,
    lotSize: NIFTY_LOT_SIZE,
    ltp: 148.2,
    stopLoss: 130,
    target: 165,
  },
  {
    id: "2",
    symbol: "NIFTY",
    instrumentType: "PE",
    strike: 24400,
    expiry: "2025-05-29",
    side: "long",
    buyPrice: 98.75,
    quantity: NIFTY_LOT_SIZE * 2,
    lotSize: NIFTY_LOT_SIZE,
    ltp: 91.11,
    stopLoss: 88,
    target: 112,
  },
];

const drift: Record<string, number> = {
  "1": 0.15,
  "2": 0.05,
};

export function tickMockLtp(positionId: string, currentLtp: number): number {
  const delta = drift[positionId] ?? 0;
  const noise = (Math.random() - 0.5) * 0.4;
  const next = Math.max(0.05, currentLtp + delta + noise);
  return Math.round(next * 100) / 100;
}
