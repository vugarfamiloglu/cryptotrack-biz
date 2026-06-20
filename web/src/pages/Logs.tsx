import { useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { useLive } from "../providers/live";
import { type LogLine } from "../api";
import { Spinner } from "../components/ui";
import { Icon } from "../components/Icon";

const LEVELS = ["all", "info", "success", "warn", "error"];

export function Logs() {
  const live = useLive();
  const { data, loading } = useData<LogLine[]>("/logs");
  const [level, setLevel] = useState("all");

  const merged = useMemo(() => {
    const seen = new Set<string>();
    const all = [...(data || []), ...live.logs];
    const out: LogLine[] = [];
    for (const l of all) { const k = l.ts + l.message; if (!seen.has(k)) { seen.add(k); out.push(l); } }
    return out.filter((l) => level === "all" || l.level === level);
  }, [data, live.logs, level]);

  if (loading && !data) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div><h1>Activity Logs</h1><p>Live tail of the pricing worker, alert engine, and ledger activity.</p></div>
        <div className="head-actions">
          <span className={`badge ${live.connected ? "pos" : "muted"}`}><span className="dot-s" />{live.connected ? "streaming" : "offline"}</span>
          <div className="pill-tabs">{LEVELS.map((l) => <button key={l} className={level === l ? "on" : ""} onClick={() => setLevel(l)}>{l}</button>)}</div>
        </div>
      </div>
      <div className="card card-pad">
        <div className="logmon">
          {merged.length ? merged.map((l, i) => (
            <div key={i} className={`logline ${l.level}`}>
              <span className="ts">{new Date(l.ts).toLocaleTimeString()}</span>
              <span className="scope">{l.scope}</span>
              <span className="msg">{l.message}</span>
            </div>
          )) : <div style={{ color: "var(--muted)", padding: 20, textAlign: "center" }}><Icon name="terminal" /> Waiting for activity…</div>}
        </div>
      </div>
    </>
  );
}
