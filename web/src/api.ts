export type Role = "owner" | "manager" | "analyst" | "viewer";

export interface SessionView {
  user: { id: string; email: string; name: string };
  org: { id: string; name: string; base_currency: string; cost_basis_method: string } | null;
  role: Role;
}

export interface Position {
  assetId: string; symbol: string; name: string; qty: string; avgCost: string; price: string;
  marketValue: string; costBasis: string; unrealizedPnL: string; unrealizedPct: string;
  realizedPnL: string; allocationPct: string; change24hPct: number | null; priceSource?: string;
}
export interface Totals { costBasis: string; marketValue: string; unrealizedPnL: string; unrealizedPct: string; realizedPnL: string; }
export interface PortfolioSummary {
  id: string; name: string; description: string; baseCurrency: string; archivedAt: string | null;
  positionsCount: number; marketValue: string; costBasis: string; unrealizedPnL: string; unrealizedPct: string; realizedPnL: string;
}
export interface ValuationResp {
  portfolio: { id: string; name: string; description: string; baseCurrency: string; archivedAt: string | null };
  method: string; baseCurrency: string; displayCurrency: string; totals: Totals; positions: Position[]; disposals: any[];
}
export interface Tx {
  id: string; type: string; assetId: string; symbol: string; assetName: string; quantity: string;
  unitPrice: string; currency: string; fee: string; executedAt: string; note: string | null; reversesId: string | null; author: string | null;
}
export interface Alert {
  id: string; kind: string; threshold: string; currency: string; window: string; channels: string[];
  cooldownMin: number; enabled: boolean; assetId: string | null; symbol: string | null;
  portfolioId: string | null; portfolioName: string | null; lastState: string; lastFiredAt: string | null;
}
export interface AlertEvent { id: string; alertId: string; kind: string; symbol: string | null; observed: string; message: string; channels: any[]; firedAt: string; acknowledgedAt: string | null; }
export interface Asset { id: string; symbol: string; name: string; decimals: number; isActive: boolean; priceUsd: string | null; change24h: number | null; }
export interface Dashboard {
  baseCurrency: string; method: string; asOf: string | null;
  totals: Totals;
  portfolios: { id: string; name: string; marketValue: string; unrealizedPnL: string; unrealizedPct: string }[];
  allocation: { assetId: string; symbol: string; name: string; marketValue: string; allocationPct: string; change24h: number | null }[];
  movers: { symbol: string; name: string; change24h: number }[];
  recentAlerts: { id: string; kind: string; message: string; observed: string; firedAt: string; acknowledgedAt: string | null }[];
  counts: { portfolios: number; transactions: number; alerts: number };
}
export interface LogLine { ts: string; level: string; scope: string; message: string; }
export interface AuditRow { id: string; actor: string; role: string; action: string; entity: string; entityId: string; detail: string; ip: string; at: string; }
export interface SettingsResp {
  org: { name: string; base_currency: string; cost_basis_method: string };
  priceProvider: string; pollSeconds: number; slackOn: boolean; hasSecret: Record<string, boolean>;
}

class ApiError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const msg = typeof data === "object" && data ? (data.error?.message || data.error || "Request failed") : String(data);
    throw new ApiError(res.status, typeof msg === "string" ? msg : "Request failed");
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => req<T>("GET", p),
  post: <T>(p: string, b?: unknown) => req<T>("POST", p, b ?? {}),
  patch: <T>(p: string, b?: unknown) => req<T>("PATCH", p, b ?? {}),
  put: <T>(p: string, b?: unknown) => req<T>("PUT", p, b ?? {}),
  del: <T>(p: string) => req<T>("DELETE", p),
  download: (path: string) => { window.open(`/api${path}`, "_blank"); },
};
export { ApiError };
