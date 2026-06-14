import type { AccountDetails, Transaction } from "../types.js";

export const mockAccount: AccountDetails = {
  userName: "Demo Trader",
  broker: "Zerodha",
  clientId: "AB1234",
  email: "demo@tradescharge.app",
  segment: "F&O (NSE)",
  pan: "XXXXX1234X",
};

function istToday(hour: number, minute: number): string {
  const dateStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`${dateStr}T${hh}:${mm}:00+05:30`).toISOString();
}

export const mockTransactions: Transaction[] = [
  {
    id: "t1",
    timestamp: istToday(9, 18),
    symbol: "NIFTY 24500 CE",
    type: "BUY",
    quantity: 65,
    price: 142.5,
    charges: 28.94,
    netAmount: -(142.5 * 65 + 28.94),
  },
  {
    id: "t2",
    timestamp: istToday(9, 42),
    symbol: "NIFTY 24400 PE",
    type: "BUY",
    quantity: 130,
    price: 98.75,
    charges: 29.38,
    netAmount: -(98.75 * 130 + 29.38),
  },
  {
    id: "t3",
    timestamp: istToday(10, 5),
    symbol: "NIFTY 24400 PE",
    type: "BUY",
    quantity: 65,
    price: 97.2,
    charges: 22.15,
    netAmount: -(97.2 * 65 + 22.15),
  },
  {
    id: "t4",
    timestamp: istToday(11, 28),
    symbol: "NIFTY 24500 CE",
    type: "SELL",
    quantity: 65,
    price: 138.4,
    charges: 31.02,
    netAmount: 138.4 * 65 - 31.02,
  },
  {
    id: "t5",
    timestamp: istToday(14, 12),
    symbol: "NIFTY 24300 PE",
    type: "BUY",
    quantity: 65,
    price: 76.35,
    charges: 24.88,
    netAmount: -(76.35 * 65 + 24.88),
  },
];
