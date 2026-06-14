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

export type IndexSymbol = "NIFTY" | "BANKNIFTY" | "SENSEX";

export type TechnicalWatchKey = IndexSymbol | "GIFTNIFTY" | "VIX";

export interface TradeSuggestion {
  type: "profit_sl" | "loss_target";
  price: number;
  label: string;
  reason: string;
  netAtPrice: number;
  meta?: string;
}

export interface EnrichedPosition {
  id: string;
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
  pnl: PositionPnL;
  breakevenPrice: number;
  moveFromLtp: number;
  capitalDeployed: number;
  suggestion: TradeSuggestion;
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
  exitOrderId?: string;
  exitOrderIds?: string[];
  exitBrokerageOrders?: number;
  entryBrokerageOrders?: number;
  kiteGrossPnL?: number;
}

export interface EnrichedClosedPosition extends ClosedPosition {
  pnl: PositionPnL;
  capitalDeployed: number;
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

export type EmaPosition = "above" | "below";
export type EmaCrossAlignment = "bullish" | "bearish";
export type EmaCrossover = "bullish_cross" | "bearish_cross";
export type WilliamsZone = "above_-20" | "below_-80" | "between";
export type RsiSignal = "overbought" | "oversold" | "neutral";
export type StochRsiSignal = "long" | "short" | "neutral";
export type StochRsiDirection = "rising" | "falling" | "flat";

export type PriceActionBias = "bullish" | "bearish" | "neutral";

export interface PriceActionInsight {
  label: string;
  bias: PriceActionBias;
}

export interface PriceActionAnalysis {
  headline: string;
  insights: PriceActionInsight[];
}

export interface TechnicalChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalChartLinePoint {
  time: number;
  value: number;
}

export interface TechnicalsChartResponse {
  label: string;
  tradingsymbol: string;
  timeframe: string;
  timeframeLabel: string;
  lastPrice: number;
  previousDayClose: number | null;
  previousDayHigh: number | null;
  previousDayLow: number | null;
  sessionVwap: number | null;
  candles: TechnicalChartCandle[];
  ma20Line: TechnicalChartLinePoint[];
  ma50Line: TechnicalChartLinePoint[];
  vwapLine: TechnicalChartLinePoint[];
  priceAction: PriceActionAnalysis;
  asOf: string;
}

export interface TechnicalTimeframeRow {
  timeframe: string;
  label: string;
  lastClose: number;
  previousDayClose: number | null;
  rsi14: number | null;
  rsiSignal: RsiSignal | null;
  stochRsi: number | null;
  stochRsiSignal: StochRsiSignal | null;
  stochRsiDirection: StochRsiDirection | null;
  williamsR14: number | null;
  williamsZone: WilliamsZone | null;
  ema20: EmaPosition | null;
  ema50: EmaPosition | null;
  ema100: EmaPosition | null;
  ema200: EmaPosition | null;
  ema20Value: number | null;
  ema50Value: number | null;
  ema100Value: number | null;
  ema200Value: number | null;
  emaCross2050Alignment: EmaCrossAlignment | null;
  emaCross2050Crossover: EmaCrossover | null;
  emaCross50100Alignment: EmaCrossAlignment | null;
  emaCross50100Crossover: EmaCrossover | null;
  emaCross50200Alignment: EmaCrossAlignment | null;
  emaCross50200Crossover: EmaCrossover | null;
  sessionVwap: number | null;
  vwapPosition: EmaPosition | null;
  barsUsed: number;
}

export interface TechnicalsResponse {
  kind: "index" | "option" | "custom";
  indexSymbol?: IndexSymbol;
  watchKey?: TechnicalWatchKey;
  label: string;
  exchange: string;
  tradingsymbol: string;
  instrumentToken: number;
  lastPrice: number;
  previousDayClose: number | null;
  previousDayHigh: number | null;
  previousDayLow: number | null;
  sessionVwap: number | null;
  asOf: string;
  timeframes: TechnicalTimeframeRow[];
}

export interface KiteInstrumentSearchHit {
  instrumentToken: number;
  tradingsymbol: string;
  name: string;
  exchange: string;
  segment: string;
  instrumentType: string;
}

export interface StrikeSearchResult {
  tradingsymbol: string;
  exchange: string;
  strike: number;
  instrumentType: "CE" | "PE";
  expiry: string;
  instrumentToken: number;
}

export interface IndexTicker {
  symbol: IndexSymbol;
  label: string;
  spotPrice: number;
  spotChange: number;
  spotChangePct: number;
}

export type MarketContextId = "GIFTNIFTY" | "VIX" | "CRUDE_JUN" | "USDINR";

export interface MarketContextQuote {
  id: MarketContextId;
  label: string;
  exchange: string;
  tradingsymbol: string;
  lastPrice: number;
  change: number;
  changePct: number;
  source?: "kite" | "yahoo" | "frankfurter" | "morningstar";
}

export interface GiftNiftyDivergence {
  giftPrice: number;
  spotPrice: number;
  points: number;
}

export interface MarketContextResponse {
  quotes: MarketContextQuote[];
  giftDivergence: GiftNiftyDivergence | null;
  asOf: string;
}

export interface OptionChainSummary {
  pcr: number;
  maxPain: number;
  atmIv: number;
  ivPercentile: number;
}

export interface OptionChainRow {
  strike: number;
  ce: OptionLeg | null;
  pe: OptionLeg | null;
  isAtm: boolean;
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

export interface TradeSelection {
  symbol: IndexSymbol;
  label: string;
  instrumentType: "CE" | "PE";
  strike: number;
  expiry: string;
  ltp: number;
  tradingsymbol: string;
  lotSize: number;
  exchange: "NFO" | "BFO";
  /** Pre-select Buy or Sell when opened from a position card */
  initialSide?: "BUY" | "SELL";
  /** Open leg direction — drives cover vs sell breakeven math */
  positionSide?: "long" | "short";
  /** Max lots available to sell (set when exiting a held position) */
  heldLots?: number;
  /** Average buy price when adding to an open position */
  existingBuyPrice?: number;
  /** Default lot count when re-entering from a closed position */
  defaultLots?: number;
  reentryFromClosed?: boolean;
  positionId?: string;
  /** Net P&L from all other legs (open + closed), excluding this position */
  otherPortfolioNet?: number;
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

export interface PositionsNavigation {
  panel: "open" | "closed";
  highlightId?: string;
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

export interface DashboardData {
  mode: "demo" | "live";
  authenticated: boolean;
  liveMarketData: boolean;
  balance: number;
  availableMargin: number;
  openingBalance?: number;
  m2mRealised?: number;
  positions: EnrichedPosition[];
  closedPositions: EnrichedClosedPosition[];
  openOrders?: DemoOrder[];
  orderHistory?: DemoOrder[];
  executedTransactions?: ExecutedTransaction[];
  overnightCarry?: OvernightCarry[];
  portfolio: PortfolioSummary;
}

export interface PortfolioSummary {
  grossPnL: number;
  netPnL: number;
  totalCharges: number;
  openPositions: number;
  walletDayChange?: number;
  kiteM2mRealised?: number;
}

export interface PnLSnapshot {
  timestamp: string;
  capital: number;
  netPnL: number;
  totalCharges: number;
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
  heldLots?: number;
  partialExitLots?: number;
  remainingLots?: number;
  adjustedPortfolioNet?: number;
  realizedPartialNet?: number;
  portfolioNetAfterPartialExit?: number;
  portfolioZeroAchievable?: boolean;
  addLots?: number;
}

export interface AuthStatus {
  kiteConfigured: boolean;
  hasApiKey: boolean;
  loggedIn?: boolean;
  kiteUserId?: string;
  csrfToken?: string;
}

export interface LtpStreamPayload {
  updates?: { id: string; ltp: number }[];
  positions?: EnrichedPosition[];
  closedPositions?: EnrichedClosedPosition[];
  balance: number;
  availableMargin?: number;
  openingBalance?: number;
  portfolio: PortfolioSummary;
  timestamp: string;
  mode?: "demo" | "live";
  liveMarketData?: boolean;
  openOrders?: DemoOrder[];
  orderHistory?: DemoOrder[];
  executedTransactions?: ExecutedTransaction[];
  overnightCarry?: OvernightCarry[];
  executionAlerts?: ExecutionAlert[];
  indexTickers?: IndexTicker[];
  optionChain?: OptionChainResponse;
  marketStream?: boolean;
  /** Present on live REST payloads — ignore SSE position LTP without this */
  ltpSource?: "kite-rest";
}
