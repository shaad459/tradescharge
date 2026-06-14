import type {
  AccountData,
  AuthStatus,
  BreakevenResult,
  DashboardData,
  IndexSymbol,
  IndexTicker,
  LtpStreamPayload,
  OptionChainResponse,
  PlaceOrderRequest,
  PlaceOrderResponse,
  StrikeSearchResult,
  TechnicalsChartResponse,
  TechnicalsResponse,
  TechnicalWatchKey,
  KiteInstrumentSearchHit,
  MarketContextResponse,
} from "../types";

const API_BASE = "";
const DEFAULT_FETCH_TIMEOUT_MS = 15000;
const BOOT_FETCH_TIMEOUT_MS = 60_000;
const OPTION_CHAIN_TIMEOUT_MS = 90_000;
const TECHNICALS_TIMEFRAME_TIMEOUT_MS = 30_000;

const TECHNICAL_TIMEFRAME_ORDER = ["1m", "3m", "5m", "15m", "30m", "1h", "1D"] as const;

let cachedCsrfToken: string | null = null;

function readCsrfFromCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(/(?:^|;\s*)tc_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function getCsrfToken(): string | null {
  return cachedCsrfToken ?? readCsrfFromCookie();
}

function mutationHeaders(extra?: HeadersInit): HeadersInit {
  const headers = new Headers(extra);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const csrf = getCsrfToken();
  if (csrf) {
    headers.set("X-CSRF-Token", csrf);
  }
  return headers;
}

export function applyAuthStatus(status: AuthStatus): void {
  cachedCsrfToken = status.csrfToken ?? readCsrfFromCookie();
}

export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError) {
    return true;
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return true;
  }
  return false;
}

export function connectionErrorMessage(err: unknown): string {
  if (err instanceof ConnectionError) {
    return err.message;
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Request timed out. If technicals are loading, click Refresh; otherwise run npm run dev.";
  }
  if (err instanceof TypeError) {
    return "Cannot reach Tradescharge backend. Start the app with: npm run dev";
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Connection failed";
}

async function readJsonBody<T>(res: Response, fallbackError: string): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    if (res.status === 502 || res.status === 503 || res.status === 504 || res.status === 500) {
      throw new ConnectionError(
        "Backend is not reachable on the API port (often 8000). From d:\\Tradescharge run: npm run dev — then open http://127.0.0.1:5173 and Refresh.",
      );
    }
    throw new Error(
      res.ok
        ? "Server returned an empty response (often a timeout while loading 7 timeframes). Click Refresh."
        : `${fallbackError} (HTTP ${res.status}, empty body).`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${fallbackError} (invalid JSON, HTTP ${res.status}).`);
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const external = init?.signal;
  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (isNetworkFailure(err)) {
      throw new ConnectionError(connectionErrorMessage(err));
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetchWithTimeout(`${API_BASE}/api/dashboard`, { credentials: "include" });
  if (!res.ok) {
    let message = "Failed to load dashboard";
    const text = await res.text();
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      if (res.status >= 500) {
        throw new ConnectionError(
          "Backend is not running. From the Tradescharge folder, run npm run dev",
        );
      }
    }
    throw new Error(message);
  }
  return res.json();
}

export async function fetchAccount(): Promise<AccountData> {
  const res = await fetchWithTimeout(
    `${API_BASE}/api/account`,
    { credentials: "include" },
    BOOT_FETCH_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error("Failed to load account");
  }
  return res.json();
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetchWithTimeout(
    `${API_BASE}/auth/status`,
    { credentials: "include" },
    BOOT_FETCH_TIMEOUT_MS,
  );
  const status = (await res.json()) as AuthStatus;
  applyAuthStatus(status);
  return status;
}

export async function logoutKite(): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/logout`, {
    method: "POST",
    headers: mutationHeaders(),
    credentials: "include",
  });
  cachedCsrfToken = null;
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Logout failed");
  }
}

export function getKiteLoginUrl(): string {
  return `${API_BASE}/auth/kite/login`;
}

export async function fetchBreakeven(
  ltp: number,
  lotSize: number,
  lots: number,
  heldLots?: number,
  existingBuyPrice?: number,
  portfolioNetPnL?: number,
  startingCapital?: number,
  positionSide: "long" | "short" = "long",
): Promise<BreakevenResult> {
  const params = new URLSearchParams({
    ltp: String(ltp),
    lotSize: String(lotSize),
    lots: String(lots),
  });
  if (heldLots !== undefined) {
    params.set("heldLots", String(heldLots));
  }
  if (existingBuyPrice !== undefined) {
    params.set("existingBuyPrice", String(existingBuyPrice));
  }
  if (portfolioNetPnL !== undefined) {
    params.set("portfolioNetPnL", String(portfolioNetPnL));
  }
  if (startingCapital !== undefined) {
    params.set("startingCapital", String(startingCapital));
  }
  if (positionSide === "short") {
    params.set("side", "short");
  }
  const res = await fetch(`${API_BASE}/api/breakeven?${params}`);
  if (!res.ok) {
    throw new Error("Failed to calculate breakeven");
  }
  return res.json();
}

let sharedLtpSource: EventSource | null = null;
let ltpReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let ltpReconnectDelayMs = 2000;
const ltpSubscribers = new Set<(payload: LtpStreamPayload) => void>();

function scheduleLtpReconnect() {
  if (ltpReconnectTimer || ltpSubscribers.size === 0) {
    return;
  }
  ltpReconnectTimer = setTimeout(() => {
    ltpReconnectTimer = null;
    attachLtpSource();
  }, ltpReconnectDelayMs);
  ltpReconnectDelayMs = Math.min(Math.round(ltpReconnectDelayMs * 1.5), 30000);
}

function attachLtpSource() {
  if (sharedLtpSource && sharedLtpSource.readyState !== EventSource.CLOSED) {
    return;
  }

  if (sharedLtpSource) {
    sharedLtpSource.close();
    sharedLtpSource = null;
  }

  sharedLtpSource = new EventSource(`${API_BASE}/api/ltp/stream`, { withCredentials: true });
  sharedLtpSource.onopen = () => {
    ltpReconnectDelayMs = 2000;
  };
  sharedLtpSource.onmessage = (event) => {
    const payload = JSON.parse(event.data) as LtpStreamPayload;
    for (const listener of ltpSubscribers) {
      listener(payload);
    }
  };
  sharedLtpSource.onerror = () => {
    sharedLtpSource?.close();
    sharedLtpSource = null;
    scheduleLtpReconnect();
  };
}

export function resetLtpStream(): void {
  if (ltpReconnectTimer) {
    clearTimeout(ltpReconnectTimer);
    ltpReconnectTimer = null;
  }
  ltpReconnectDelayMs = 2000;
  if (sharedLtpSource) {
    sharedLtpSource.close();
    sharedLtpSource = null;
  }
  if (ltpSubscribers.size > 0) {
    attachLtpSource();
  }
}

export function subscribeLtpStream(
  onUpdate: (payload: LtpStreamPayload) => void,
): () => void {
  ltpSubscribers.add(onUpdate);
  attachLtpSource();

  return () => {
    ltpSubscribers.delete(onUpdate);
    if (ltpSubscribers.size === 0) {
      if (ltpReconnectTimer) {
        clearTimeout(ltpReconnectTimer);
        ltpReconnectTimer = null;
      }
      if (sharedLtpSource) {
        sharedLtpSource.close();
        sharedLtpSource = null;
      }
    }
  };
}

export async function fetchIndexTickers(): Promise<IndexTicker[]> {
  const res = await fetch(`${API_BASE}/api/instruments/index-tickers`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error("Failed to load index tickers");
  }
  const data = await res.json();
  return data.tickers;
}

export async function fetchIndices(): Promise<IndexSymbol[]> {
  const res = await fetch(`${API_BASE}/api/instruments/indices`);
  const data = await res.json();
  return data.indices;
}

export async function watchOptionChain(
  symbol: IndexSymbol,
  expiry: string,
): Promise<{ ok: boolean; chain?: OptionChainResponse }> {
  const res = await fetchWithTimeout(
    `${API_BASE}/api/instruments/chain/watch`,
    {
      method: "POST",
      credentials: "include",
      headers: mutationHeaders(),
      body: JSON.stringify({ symbol, expiry }),
    },
    OPTION_CHAIN_TIMEOUT_MS,
  );
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? "Failed to start chain stream");
  }
  return res.json() as Promise<{ ok: boolean; chain?: OptionChainResponse }>;
}

export async function fetchOptionChain(
  symbol: IndexSymbol,
  expiry?: string,
  search?: string,
  withLiveQuotes = false,
): Promise<OptionChainResponse> {
  const params = new URLSearchParams({ symbol });
  if (expiry) params.set("expiry", expiry);
  if (search) params.set("search", search);
  if (withLiveQuotes) params.set("full", "1");
  const res = await fetchWithTimeout(
    `${API_BASE}/api/instruments/chain?${params}`,
    { credentials: "include" },
    OPTION_CHAIN_TIMEOUT_MS,
  );
  const data = await readJsonBody<OptionChainResponse & { error?: string }>(
    res,
    "Failed to load option chain",
  );
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to load option chain");
  }
  return data;
}

export async function fetchInstrumentQuote(
  tradingsymbol: string,
  exchange: "NFO" | "BFO" = "NFO",
): Promise<{ ltp: number; live: boolean }> {
  const params = new URLSearchParams({ tradingsymbol, exchange });
  const res = await fetch(`${API_BASE}/api/instruments/quote?${params}`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error("Failed to load instrument quote");
  }
  return res.json();
}

export async function cancelOrder(
  orderId: string,
): Promise<{ success: boolean; message: string; dashboard: DashboardData }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/orders/${orderId}/cancel`, {
    method: "POST",
    headers: mutationHeaders(),
    credentials: "include",
  });

  const data = (await res.json()) as {
    success?: boolean;
    message?: string;
    dashboard?: DashboardData;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error ?? "Failed to cancel order");
  }

  if (!data.dashboard) {
    throw new Error("Server did not return updated dashboard");
  }

  return {
    success: Boolean(data.success),
    message: data.message ?? "Order cancelled.",
    dashboard: data.dashboard,
  };
}

export async function placeOrder(order: PlaceOrderRequest): Promise<PlaceOrderResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(`${API_BASE}/api/orders`, {
      method: "POST",
      headers: mutationHeaders(),
      credentials: "include",
      body: JSON.stringify(order),
      signal: controller.signal,
    });

    let data: PlaceOrderResponse & { error?: string };
    try {
      data = await res.json();
    } catch {
      throw new Error("Server returned an invalid response. Is the backend running?");
    }

    if (!res.ok) {
      throw new Error(data.error ?? "Order failed");
    }
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Order timed out. Check backend connection and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshDashboard(): Promise<DashboardData> {
  return fetchDashboard();
}

export async function postAnalyticsEvents(
  sessionId: string,
  events: Array<{ event: string; properties?: Record<string, string | number | boolean> }>,
  visitorId?: string,
): Promise<{ visitorId?: string }> {
  const res = await fetch(`${API_BASE}/api/analytics/events`, {
    method: "POST",
    headers: mutationHeaders(),
    credentials: "include",
    body: JSON.stringify({ sessionId, visitorId, events }),
  });
  if (!res.ok) {
    throw new Error("Analytics event failed");
  }
  return res.json();
}

function technicalsQueryParams(
  params: {
    index?: TechnicalWatchKey;
    exchange?: string;
    tradingsymbol?: string;
    instrumentToken?: number;
    tf?: string;
  },
  extra?: { bootstrapOnly?: boolean },
): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.index) qs.set("index", params.index);
  if (params.exchange) qs.set("exchange", params.exchange);
  if (params.tradingsymbol) qs.set("tradingsymbol", params.tradingsymbol);
  if (params.instrumentToken != null && params.instrumentToken > 0) {
    qs.set("instrumentToken", String(params.instrumentToken));
  }
  if (params.tf) qs.set("tf", params.tf);
  if (extra?.bootstrapOnly) qs.set("bootstrap", "0");
  return qs;
}

interface TechnicalsTimeframeResponse {
  kind: TechnicalsResponse["kind"];
  indexSymbol?: IndexSymbol;
  watchKey?: TechnicalWatchKey;
  label: string;
  exchange: string;
  tradingsymbol: string;
  instrumentToken: number;
  previousDayClose: number | null;
  previousDayHigh: number | null;
  previousDayLow: number | null;
  sessionVwap: number | null;
  timeframe: TechnicalsResponse["timeframes"][number];
  asOf: string;
  error?: string;
}

function mergeTechnicalsFromFrames(
  fulfilled: PromiseFulfilledResult<TechnicalsTimeframeResponse>[],
): TechnicalsResponse {
  const first = fulfilled[0]!.value;
  const timeframes = TECHNICAL_TIMEFRAME_ORDER.map((tf) => {
    const hit = fulfilled.find((r) => r.value.timeframe.timeframe === tf);
    return hit?.value.timeframe;
  }).filter((row): row is TechnicalsResponse["timeframes"][number] => row != null);

  return {
    kind: first.kind,
    indexSymbol: first.indexSymbol,
    watchKey: first.watchKey,
    label: first.label,
    exchange: first.exchange,
    tradingsymbol: first.tradingsymbol,
    instrumentToken: first.instrumentToken,
    lastPrice: timeframes[timeframes.length - 1]?.lastClose ?? 0,
    previousDayClose: first.previousDayClose,
    previousDayHigh: first.previousDayHigh,
    previousDayLow: first.previousDayLow,
    sessionVwap: first.sessionVwap,
    asOf: new Date().toISOString(),
    timeframes,
  };
}

export async function searchKiteInstruments(q: string): Promise<KiteInstrumentSearchHit[]> {
  const params = new URLSearchParams({ q });
  const res = await fetchWithTimeout(`${API_BASE}/api/technicals/instruments?${params}`, {
    credentials: "include",
  });
  const data = await readJsonBody<{ results?: KiteInstrumentSearchHit[]; error?: string }>(
    res,
    "Instrument search failed",
  );
  if (!res.ok) {
    throw new Error(data.error ?? "Instrument search failed");
  }
  return data.results ?? [];
}

export async function fetchTechnicalsChart(params: {
  index?: TechnicalWatchKey;
  exchange?: string;
  tradingsymbol?: string;
  instrumentToken?: number;
  tf?: string;
}): Promise<TechnicalsChartResponse> {
  const qs = technicalsQueryParams(params);
  const res = await fetchWithTimeout(
    `${API_BASE}/api/technicals/chart?${qs}`,
    { credentials: "include" },
    TECHNICALS_TIMEFRAME_TIMEOUT_MS,
  );
  const data = await readJsonBody<TechnicalsChartResponse & { error?: string }>(
    res,
    "Failed to load chart",
  );
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to load chart");
  }
  return data;
}

export async function fetchTechnicalsTimeframe(
  params: {
    index?: TechnicalWatchKey;
    exchange?: string;
    tradingsymbol?: string;
    instrumentToken?: number;
    tf: (typeof TECHNICAL_TIMEFRAME_ORDER)[number];
  },
): Promise<TechnicalsTimeframeResponse> {
  const qs = technicalsQueryParams(params);
  const res = await fetchWithTimeout(
    `${API_BASE}/api/technicals/timeframe?${qs}`,
    { credentials: "include" },
    TECHNICALS_TIMEFRAME_TIMEOUT_MS,
  );
  const data = await readJsonBody<TechnicalsTimeframeResponse>(
    res,
    "Failed to load technical indicators",
  );
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to load technical indicators");
  }
  return data;
}

export interface CrudeFutureOption {
  monthCode: string;
  label: string;
  quoteKey: string;
  exchange: string;
  tradingsymbol: string;
}

export async function fetchCrudeFutures(): Promise<CrudeFutureOption[]> {
  const res = await fetchWithTimeout(`${API_BASE}/api/technicals/crude-futures`);
  const data = await readJsonBody<{ futures?: CrudeFutureOption[]; error?: string }>(
    res,
    "Failed to load crude futures",
  );
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to load crude futures");
  }
  return data.futures ?? [];
}

export async function fetchMarketContext(params?: {
  crudeQuoteKey?: string;
}): Promise<MarketContextResponse> {
  const qs = new URLSearchParams();
  if (params?.crudeQuoteKey) {
    qs.set("crude", params.crudeQuoteKey);
  }
  const query = qs.toString();
  const url = `${API_BASE}/api/technicals/market-context${query ? `?${query}` : ""}`;
  const res = await fetchWithTimeout(url, {
    credentials: "include",
  });
  const data = await readJsonBody<MarketContextResponse & { error?: string }>(
    res,
    "Failed to load market quotes",
  );
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to load market quotes");
  }
  return data;
}

/** Loads each timeframe in parallel (faster, avoids one long request timing out). */
export async function fetchTechnicals(params: {
  index?: TechnicalWatchKey;
  exchange?: string;
  tradingsymbol?: string;
  instrumentToken?: number;
}): Promise<TechnicalsResponse> {
  const settled = await Promise.allSettled(
    TECHNICAL_TIMEFRAME_ORDER.map((tf) => fetchTechnicalsTimeframe({ ...params, tf })),
  );

  const fulfilled = settled.filter(
    (r): r is PromiseFulfilledResult<TechnicalsTimeframeResponse> => r.status === "fulfilled",
  );
  if (fulfilled.length === 0) {
    const firstReject = settled.find((r) => r.status === "rejected");
    throw firstReject?.status === "rejected"
      ? firstReject.reason
      : new Error("Failed to load technical indicators");
  }

  const failed = settled.length - fulfilled.length;
  if (failed > 0 && fulfilled.length === 0) {
    throw new Error("Failed to load technical indicators");
  }

  return mergeTechnicalsFromFrames(fulfilled);
}

export type TechnicalsStreamParams = {
  index?: TechnicalWatchKey;
  exchange?: string;
  tradingsymbol?: string;
  instrumentToken?: number;
};

let technicalsStreamSource: EventSource | null = null;
let technicalsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let technicalsReconnectDelayMs = 2000;
let technicalsStreamParams: TechnicalsStreamParams | null = null;
let technicalsOnUpdate: ((payload: TechnicalsResponse) => void) | null = null;
let technicalsOnError: ((message: string) => void) | null = null;
let technicalsBootstrapOnly = false;

function scheduleTechnicalsReconnect() {
  if (technicalsReconnectTimer || !technicalsStreamParams || !technicalsOnUpdate) {
    return;
  }
  technicalsReconnectTimer = setTimeout(() => {
    technicalsReconnectTimer = null;
    attachTechnicalsStream();
  }, technicalsReconnectDelayMs);
  technicalsReconnectDelayMs = Math.min(Math.round(technicalsReconnectDelayMs * 1.5), 30_000);
}

function attachTechnicalsStream() {
  if (!technicalsStreamParams || !technicalsOnUpdate) {
    return;
  }
  if (technicalsStreamSource && technicalsStreamSource.readyState !== EventSource.CLOSED) {
    return;
  }
  if (technicalsStreamSource) {
    technicalsStreamSource.close();
    technicalsStreamSource = null;
  }

  const qs = technicalsQueryParams(technicalsStreamParams, {
    bootstrapOnly: technicalsBootstrapOnly,
  });
  technicalsStreamSource = new EventSource(`${API_BASE}/api/technicals/stream?${qs}`, {
    withCredentials: true,
  });

  technicalsStreamSource.onopen = () => {
    technicalsReconnectDelayMs = 2000;
  };

  technicalsStreamSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as TechnicalsResponse;
      technicalsOnUpdate?.(payload);
    } catch {
      technicalsOnError?.("Invalid technicals stream payload");
    }
  };

  technicalsStreamSource.onerror = () => {
    technicalsStreamSource?.close();
    technicalsStreamSource = null;
    scheduleTechnicalsReconnect();
  };
}

/** Live technicals — tick updates over SSE; use with fetchTechnicals for instant snapshot. */
export function subscribeTechnicalsStream(
  params: TechnicalsStreamParams,
  onUpdate: (payload: TechnicalsResponse) => void,
  onError?: (message: string) => void,
  options?: { bootstrapOnly?: boolean; deferMs?: number },
): () => void {
  technicalsStreamParams = params;
  technicalsOnUpdate = onUpdate;
  technicalsOnError = onError ?? null;
  technicalsReconnectDelayMs = 2000;
  technicalsBootstrapOnly = options?.bootstrapOnly ?? false;

  const deferMs = options?.deferMs ?? 0;
  let deferTimer: ReturnType<typeof setTimeout> | null = null;
  if (deferMs > 0) {
    deferTimer = setTimeout(() => attachTechnicalsStream(), deferMs);
  } else {
    attachTechnicalsStream();
  }

  return () => {
    technicalsStreamParams = null;
    technicalsOnUpdate = null;
    technicalsOnError = null;
    technicalsBootstrapOnly = false;
    if (deferTimer) {
      clearTimeout(deferTimer);
    }
    if (technicalsReconnectTimer) {
      clearTimeout(technicalsReconnectTimer);
      technicalsReconnectTimer = null;
    }
    if (technicalsStreamSource) {
      technicalsStreamSource.close();
      technicalsStreamSource = null;
    }
  };
}

export async function searchStrikeInstruments(
  symbol: IndexSymbol,
  q: string,
  expiry?: string,
): Promise<StrikeSearchResult[]> {
  const params = new URLSearchParams({ symbol, q });
  if (expiry) params.set("expiry", expiry);
  const res = await fetchWithTimeout(`${API_BASE}/api/technicals/search?${params}`, {
    credentials: "include",
  });
  const data = await readJsonBody<{ results?: StrikeSearchResult[]; error?: string }>(
    res,
    "Strike search failed",
  );
  if (!res.ok) {
    throw new Error(data.error ?? "Strike search failed");
  }
  return data.results ?? [];
}

export async function postFeedback(input: {
  sessionId: string;
  visitorId: string;
  kiteUserId?: string;
  message: string;
  rating?: number;
  contact?: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/analytics/feedback`, {
    method: "POST",
    headers: mutationHeaders(),
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Feedback failed");
  }
}
