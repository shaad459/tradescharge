import type { Position, ClosedPosition } from "../types.js";
import { mockPositions, tickMockLtp } from "./positions.js";
import { yesterdayIstIso } from "../utils/istDate.js";

function nearestThursday(): string {
  const date = new Date();
  const day = date.getDay();
  const daysUntil = (4 - day + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntil);
  return date.toISOString().slice(0, 10);
}

function withCurrentExpiry(position: Position): Position {
  const openedAt =
    position.openedAt ??
    (position.id === "2" ? yesterdayIstIso() : new Date().toISOString());
  return {
    ...position,
    expiry: nearestThursday(),
    product: position.product ?? "NRML",
    openedAt,
  };
}

let positions: Position[] = mockPositions.map((p) => withCurrentExpiry({ ...p }));
let closedPositions: ClosedPosition[] = [
  {
    id: "c1",
    symbol: "NIFTY",
    instrumentType: "PE",
    strike: 24300,
    expiry: "2025-05-22",
    side: "long",
    buyPrice: 85.5,
    exitPrice: 92.3,
    quantity: 65,
    lotSize: 65,
    closedAt: "2025-05-20T10:42:00.000Z",
  },
  {
    id: "c2",
    symbol: "NIFTY",
    instrumentType: "CE",
    strike: 24600,
    expiry: "2025-05-22",
    side: "long",
    buyPrice: 118.25,
    exitPrice: 105.8,
    quantity: 130,
    lotSize: 65,
    closedAt: "2025-05-21T14:18:00.000Z",
  },
];
let nextId = positions.length + 1;
let nextClosedId = closedPositions.length + 1;
export const MOCK_BALANCE = 245680.5;

export function getMockPositions(): Position[] {
  return positions.map((p) => ({ ...p }));
}

export function getClosedPositions(): ClosedPosition[] {
  return closedPositions.map((p) => ({ ...p }));
}

export function setMockPositionLtp(id: string, ltp: number) {
  const pos = positions.find((p) => p.id === id);
  if (pos) {
    pos.ltp = ltp;
  }
}

export function tickAllMockLtps(): void {
  for (const pos of positions) {
    pos.ltp = tickMockLtp(pos.id, pos.ltp);
  }
}

export function addMockPosition(position: Omit<Position, "id">): Position {
  const created: Position = {
    ...position,
    id: String(nextId++),
  };
  positions.push(created);
  return created;
}

export function mergeOrAddMockPosition(
  symbol: string,
  instrumentType: "CE" | "PE",
  strike: number,
  expiry: string,
  side: "long" | "short",
  buyPrice: number,
  quantity: number,
  lotSize: number,
  product: "NRML" | "MIS" = "NRML",
): Position {
  const existing = positions.find(
    (p) =>
      p.symbol === symbol &&
      p.instrumentType === instrumentType &&
      p.strike === strike &&
      p.expiry === expiry &&
      p.side === side,
  );

  if (existing && side === "long") {
    const totalQty = existing.quantity + quantity;
    existing.buyPrice =
      Math.round(((existing.buyPrice * existing.quantity + buyPrice * quantity) / totalQty) * 100) /
      100;
    existing.quantity = totalQty;
    existing.ltp = buyPrice;
    return existing;
  }

  return addMockPosition({
    symbol,
    instrumentType,
    strike,
    expiry,
    side,
    buyPrice,
    quantity,
    lotSize,
    ltp: buyPrice,
    product,
    openedAt: new Date().toISOString(),
  });
}

export function reduceMockPosition(
  symbol: string,
  instrumentType: "CE" | "PE",
  strike: number,
  expiry: string,
  quantity: number,
  exitPrice: number,
): { closed: boolean; remaining: number; closedPositionId: string } {
  const existing = positions.find(
    (p) =>
      p.symbol === symbol &&
      p.instrumentType === instrumentType &&
      p.strike === strike &&
      p.expiry === expiry &&
      p.side === "long",
  );

  if (!existing) {
    throw new Error("You don't have sufficient holdings to place a sell order.");
  }

  if (quantity > existing.quantity) {
    const maxLots = Math.floor(existing.quantity / existing.lotSize);
    throw new Error(`You can sell maximum ${maxLots} lot${maxLots === 1 ? "" : "s"}.`);
  }

  const closedPositionId = `c${nextClosedId++}`;
  closedPositions.unshift({
    id: closedPositionId,
    symbol: existing.symbol,
    instrumentType: existing.instrumentType,
    strike: existing.strike,
    expiry: existing.expiry,
    side: existing.side,
    buyPrice: existing.buyPrice,
    exitPrice,
    quantity,
    lotSize: existing.lotSize,
    closedAt: new Date().toISOString(),
  });

  existing.quantity -= quantity;

  if (existing.quantity === 0) {
    positions = positions.filter((p) => p.id !== existing.id);
    return { closed: true, remaining: 0, closedPositionId };
  }

  return { closed: false, remaining: existing.quantity, closedPositionId };
}

export function resetMockPositions() {
  positions = mockPositions.map((p) => withCurrentExpiry({ ...p }));
  nextId = positions.length + 1;
  closedPositions = [];
  nextClosedId = 1;
}
