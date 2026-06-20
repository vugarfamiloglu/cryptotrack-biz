import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { useToast } from "./toast";
import type { LogLine } from "../api";

interface PriceTick { price: string; change24h?: number | null; source?: string; }
interface LiveCtx {
  prices: Record<string, PriceTick>;
  asOf: string | null;
  connected: boolean;
  alertTick: number;
  logs: LogLine[];
}
const Ctx = createContext<LiveCtx>({ prices: {}, asOf: null, connected: false, alertTick: 0, logs: [] });

export function LiveProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const toast = useToast();
  const [prices, setPrices] = useState<Record<string, PriceTick>>({});
  const [asOf, setAsOf] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [alertTick, setAlertTick] = useState(0);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!session) { esRef.current?.close(); esRef.current = null; setConnected(false); return; }
    const es = new EventSource("/api/stream");
    esRef.current = es;
    es.addEventListener("open", () => setConnected(true));
    es.addEventListener("error", () => setConnected(false));
    es.addEventListener("hello", (e) => { try { setAsOf(JSON.parse((e as MessageEvent).data).asOf); } catch { /* */ } });
    es.addEventListener("prices", (e) => {
      try { const d = JSON.parse((e as MessageEvent).data); setPrices(d.prices || {}); if (d.asOf) setAsOf(d.asOf); } catch { /* */ }
    });
    es.addEventListener("alert", (e) => {
      try { const d = JSON.parse((e as MessageEvent).data); toast("warn", "Alert triggered", d.message); setAlertTick((t) => t + 1); } catch { /* */ }
    });
    es.addEventListener("log", (e) => {
      try { const d = JSON.parse((e as MessageEvent).data) as LogLine; setLogs((l) => [...l.slice(-299), d]); } catch { /* */ }
    });
    return () => { es.close(); esRef.current = null; };
  }, [session, toast]);

  return <Ctx.Provider value={{ prices, asOf, connected, alertTick, logs }}>{children}</Ctx.Provider>;
}
export const useLive = () => useContext(Ctx);
