export const CCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", AZN: "₼", TRY: "₺" };

export function money(value: string | number, currency = "USD", dp = 2): string {
  const n = Number(value);
  if (!isFinite(n)) return "—";
  const sym = CCY_SYMBOL[currency] ?? "";
  const body = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return `${n < 0 ? "-" : ""}${sym}${body}`;
}

export function compact(value: string | number, currency = "USD"): string {
  const n = Number(value);
  if (!isFinite(n)) return "—";
  const sym = CCY_SYMBOL[currency] ?? "";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${sym}${abs.toFixed(2)}`;
}

export function signed(value: string | number, dp = 2): string {
  const n = Number(value);
  if (!isFinite(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

export function pct(value: string | number, dp = 2): string {
  const n = Number(value);
  if (!isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

export function qty(value: string | number): string {
  const n = Number(value);
  if (!isFinite(n)) return String(value);
  const dp = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dp });
}

export const plClass = (value: string | number): string => {
  const n = Number(value);
  return n > 0 ? "pl-pos" : n < 0 ? "pl-neg" : "pl-flat";
};

export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (isNaN(d)) return iso;
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function dateStr(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

export function dateTimeStr(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
