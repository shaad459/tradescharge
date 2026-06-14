export interface ChargeLineItem {
  brokerage: number;
  stampDuty: number;
  stt: number;
  exchangeCharges: number;
  sebiCharges: number;
  gst: number;
  total: number;
}

export interface RoundTripCharges {
  entry: ChargeLineItem;
  exit: ChargeLineItem;
  total: number;
}

export interface PositionPnL {
  gross: number;
  charges: RoundTripCharges;
  net: number;
}

export interface ExecutedTransaction {
  id: string;
  type: "order" | "trade";
  side: "BUY" | "SELL";
  tradingsymbol: string;
  instrumentLabel: string;
  symbol: string;
  instrumentType: "CE" | "PE";
  strike: number;
  expiry: string;
  exchange: "NFO" | "BFO";
  product: "NRML" | "MIS";
  status: string;
  quantity: number;
  filledQuantity: number;
  price: number;
  orderId: string;
  tradeId?: string;
  orderType: string;
  timestamp: string;
  lotSize: number;
  lots: number;
  bookKey: string;
}

export interface Position {
  id: string;
  tradingsymbol?: string;
  symbol: string;
  instrumentType: "CE" | "PE";
  strike: number;
  expiry: string;
  side: "long" | "short";
  buyPrice: number;
  quantity: number;
  lotSize: number;
  ltp: number;
  product?: "NRML" | "MIS";
  openedAt?: string;
  stopLoss?: number;
  target?: number;
  /** Kite positions API `pnl` — authoritative gross MTM in live mode */
  kiteGrossPnL?: number;
  exchange?: "NFO" | "BFO";
  /** Kite instrument token — used for WebSocket LTP streaming */
  instrumentToken?: number;
  /** Last LTP from Kite REST — anchor for rejecting bad WebSocket ticks */
  restLtp?: number;
}

export interface ClosedPosition {
  id: string;
  symbol: string;
  instrumentType: "CE" | "PE";
  strike: number;
  expiry: string;
  side: "long" | "short";
  buyPrice: number;
  exitPrice: number;
  quantity: number;
  lotSize: number;
  closedAt: string;
  tradingsymbol?: string;
  exchange?: "NFO" | "BFO";
  product?: "NRML" | "MIS";
  /** Primary Kite exit order id (first fill in the leg) */
  exitOrderId?: string;
  /** All exit order ids when autoslice / batched sells merge into one row */
  exitOrderIds?: string[];
  /** Zerodha charges ₹20 brokerage per executed exit order — not per fill */
  exitBrokerageOrders?: number;
  /** Distinct buy orders today on this contract (for brokerage) */
  entryBrokerageOrders?: number;
  /** Kite day-book realised — authoritative gross (matches Kite Positions when qty 0) */
  kiteGrossPnL?: number;
}

export type OrderStatus = "OPEN" | "EXECUTED" | "CANCELLED";

export type OrderTag = "SL" | "TARGET" | "ENTRY";

export interface DemoOrder {
  id: string;
  tradingsymbol: string;
  symbol: string;
  instrumentType: "CE" | "PE";
  strike: number;
  expiry: string;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "SL" | "SL-M";
  product: "NRML" | "MIS";
  quantity: number;
  lotSize: number;
  lots: number;
  price?: number;
  triggerPrice?: number;
  status: OrderStatus;
  orderTag?: OrderTag;
  placedAt: string;
  updatedAt: string;
  fillPrice?: number;
  referenceLtp: number;
  closedPositionId?: string;
  openPositionId?: string;
  /** Kite order variety (regular, amo) — live cancel */
  variety?: string;
}

export interface OvernightCarry {
  positionId: string;
  symbol: string;
  instrumentType: "CE" | "PE";
  strike: number;
  expiry: string;
  quantity: number;
  lotSize: number;
  lots: number;
  product: "NRML" | "MIS";
  buyPrice: number;
  ltp: number;
  openedAt: string;
}

export interface ExecutionAlert {
  id: string;
  orderId: string;
  orderTag: "SL" | "TARGET";
  side: "BUY" | "SELL";
  symbol: string;
  instrumentType: "CE" | "PE";
  strike: number;
  expiry: string;
  fillPrice?: number;
  message: string;
  navigateTo: "open" | "closed";
  targetId: string;
  timestamp: string;
}

export interface DashboardData {
  mode: "demo" | "live";
  authenticated: boolean;
  liveMarketData: boolean;
  balance: number;
  availableMargin: number;
  openingBalance?: number;
  /** Kite equity M2M realised today — fallback when position rows omit gross */
  m2mRealised?: number;
  positions: EnrichedPosition[];
  closedPositions: EnrichedClosedPosition[];
  openOrders: DemoOrder[];
  orderHistory: DemoOrder[];
  executedTransactions?: ExecutedTransaction[];
  overnightCarry: OvernightCarry[];
  portfolio: PortfolioSummary;
}

export interface PortfolioSummary {
  grossPnL: number;
  netPnL: number;
  totalCharges: number;
  openPositions: number;
  /** Kite live balance minus opening balance (cash move today). */
  walletDayChange?: number;
  /** Kite equity `m2m_realised` when the API posts it. */
  kiteM2mRealised?: number;
}

export interface AccountDetails {
  userName: string;
  broker: string;
  clientId: string;
  email: string;
  segment: string;
  pan: string;
}

export interface Transaction {
  id: string;
  timestamp: string;
  symbol: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  charges: number;
  netAmount: number;
}

export interface AccountData {
  account: AccountDetails;
  transactions: Transaction[];
  balance: number;
  availableMargin: number;
  utilisedMargin: number;
  mode: "demo" | "live";
}

export interface EnrichedPosition extends Position {
  pnl: PositionPnL;
  breakevenPrice: number;
  legBreakevenPrice?: number;
  moveFromLtp: number;
  capitalDeployed: number;
  suggestion: TradeSuggestion;
}

export interface EnrichedClosedPosition extends ClosedPosition {
  pnl: PositionPnL;
  capitalDeployed: number;
}

export interface TradeSuggestion {
  type: "profit_sl" | "loss_target";
  price: number;
  label: string;
  reason: string;
  netAtPrice: number;
  meta?: string;
}

export interface OptionLeg {
  instrumentType: "CE" | "PE";
  strike: number;
  ltp: number;
  ltpChange: number;
  oi: number;
  oiChange: number;
  volume: number;
  iv: number;
  tradingsymbol: string;
  expiry: string;
  instrumentToken?: number;
}

export interface OptionChainRow {
  strike: number;
  ce: OptionLeg | null;
  pe: OptionLeg | null;
  isAtm: boolean;
}

export interface IndexTicker {
  symbol: string;
  label: string;
  spotPrice: number;
  spotChange: number;
  spotChangePct: number;
}

export interface OptionChainSummary {
  pcr: number;
  maxPain: number;
  atmIv: number;
  ivPercentile: number;
}

export interface OptionChainResponse {
  symbol: string;
  label: string;
  spotPrice: number;
  spotChange: number;
  spotChangePct: number;
  lotSize: number;
  expiry: string;
  expiries: string[];
  chain: OptionChainRow[];
  summary: OptionChainSummary;
  liveData?: boolean;
}

export interface PlaceOrderRequest {
  symbol: string;
  tradingsymbol: string;
  instrumentType: "CE" | "PE";
  strike: number;
  expiry: string;
  side: "BUY" | "SELL";
  lots: number;
  lotSize: number;
  ltp: number;
  orderType: "MARKET" | "LIMIT" | "SL" | "SL-M";
  product: "NRML" | "MIS";
  validity: "DAY" | "IOC";
  price?: number;
  triggerPrice?: number;
  disclosedQuantity?: number;
  amo?: boolean;
  exchange?: "NFO" | "BFO";
  mode?: "demo" | "live";
}

export interface PlaceOrderResponse {
  success: boolean;
  orderId: string;
  message: string;
  mode: "demo" | "live";
  dashboard?: DashboardData;
}

export interface BreakevenResult {
  lots: number;
  quantity: number;
  lotSize: number;
  entryPrice: number;
  capitalDeployed: number;
  entryCharges: number;
  totalCharges: number;
  totalChargesAtExit?: number;
  grossPnLAtLtp: number;
  netPnLAtLtp: number;
  breakevenPrice: number;
  legBreakevenPrice?: number;
  moveFromLtp: number;
  exitChargesAtBreakeven: number;
  addingLots: boolean;
  recoveryMode?: boolean;
  portfolioNetPnL?: number;
  newTradeNetAtLtp?: number;
  overallNetAtRecovery?: number;
  startingCapital?: number;
  capitalAfterRecovery?: number;
  /** Total lots held before a partial exit scenario */
  heldLots?: number;
  /** Lots exited at LTP before computing remaining-leg breakeven */
  partialExitLots?: number;
  /** Active lots after partial exit */
  remainingLots?: number;
  /** Portfolio net from other legs + realized partial exit at LTP */
  adjustedPortfolioNet?: number;
  /** Net P&L booked from selling partialExitLots at LTP */
  realizedPartialNet?: number;
  /** Overall portfolio net after partial exit at LTP (before remaining leg closes) */
  portfolioNetAfterPartialExit?: number;
  /** False when remaining lots cannot absorb enough P&L to zero the portfolio */
  portfolioZeroAchievable?: boolean;
  /** Lots added at LTP on top of an existing held leg */
  addLots?: number;
}
