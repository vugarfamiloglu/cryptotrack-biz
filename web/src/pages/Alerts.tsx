import { useState } from "react";
import { useData } from "../hooks/useData";
import { useLive } from "../providers/live";
import { useAuth } from "../providers/auth";
import { useToast } from "../providers/toast";
import { useDialogs } from "../providers/dialogs";
import { api, type Alert, type AlertEvent, type Asset, type PortfolioSummary } from "../api";
import { Spinner, EmptyState, Modal, Field } from "../components/ui";
import { Icon } from "../components/Icon";
import { pct, money, timeAgo } from "../format";

const KINDS = [
  { v: "price_above", label: "Price rises above", target: "asset", unit: "price" },
  { v: "price_below", label: "Price falls below", target: "asset", unit: "price" },
  { v: "pct_change", label: "24h change crosses", target: "asset", unit: "%" },
  { v: "portfolio_value", label: "Portfolio value reaches", target: "portfolio", unit: "value" },
  { v: "pnl", label: "Unrealized P/L crosses", target: "portfolio", unit: "value" },
];
const ALL_CHANNELS = [["inapp", "In-app"], ["slack", "Slack"], ["email:treasury@acme.test", "Email"]];

function describe(a: Alert): string {
  const k = KINDS.find((x) => x.v === a.kind);
  const tgt = a.symbol || a.portfolioName || "—";
  if (a.kind === "pct_change") return `${tgt} 24h change crosses ${pct(a.threshold)}`;
  if (a.kind === "portfolio_value") return `${tgt} value reaches ${money(a.threshold, a.currency)}`;
  if (a.kind === "pnl") return `${tgt} unrealized P/L crosses ${money(a.threshold, a.currency)}`;
  return `${tgt} ${a.kind === "price_above" ? "rises above" : "falls below"} ${money(a.threshold, a.currency)}`;
}

export function Alerts() {
  const live = useLive();
  const { can } = useAuth();
  const toast = useToast();
  const { confirm } = useDialogs();
  const { data: alerts, loading, reload } = useData<Alert[]>("/alerts", [live.alertTick]);
  const { data: events, reload: reloadEvents } = useData<AlertEvent[]>("/alerts/events", [live.alertTick]);
  const [creating, setCreating] = useState(false);

  const toggle = async (a: Alert) => {
    try { await api.patch(`/alerts/${a.id}`, { enabled: !a.enabled }); reload(); }
    catch (e: any) { toast("error", "Update failed", e.message); }
  };
  const test = async (a: Alert) => {
    try { const r = await api.post<{ results: any[] }>(`/alerts/${a.id}/test`); toast("info", "Test dispatched", r.results.map((x) => `${x.channel}:${x.ok ? "ok" : x.note || "fail"}`).join("  ")); }
    catch (e: any) { toast("error", "Test failed", e.message); }
  };
  const del = async (a: Alert) => {
    if (await confirm({ title: "Delete alert?", body: describe(a), danger: true })) {
      try { await api.del(`/alerts/${a.id}`); toast("success", "Alert deleted"); reload(); }
      catch (e: any) { toast("error", "Delete failed", e.message); }
    }
  };
  const ack = async (e: AlertEvent) => { try { await api.post(`/alerts/events/${e.id}/ack`); reloadEvents(); } catch { /* */ } };

  if (loading && !alerts) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div><h1>Alerts</h1><p>Edge-triggered price and portfolio thresholds with cooldown. Fires once per crossing.</p></div>
        {can("analyst") && <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New alert</button>}
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><h3>Alert rules</h3><span className="sub">{alerts?.length ?? 0} configured</span></div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alerts?.length ? alerts.map((a) => (
              <div key={a.id} className={`alert-row ${a.enabled ? "" : "off"}`}>
                <button className={`switch ${a.enabled ? "on" : ""}`} onClick={() => can("analyst") && toggle(a)} disabled={!can("analyst")} aria-label="Toggle"><span /></button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{describe(a)}</div>
                  <div style={{ fontSize: 11.5, color: "var(--faint)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                    {a.channels.map((c) => c.split(":")[0]).join(" · ")} · cooldown {a.cooldownMin}m{a.lastFiredAt ? ` · last fired ${timeAgo(a.lastFiredAt)}` : ""}
                  </div>
                </div>
                <div className="row-actions">
                  {can("analyst") && <button className="btn btn-sm btn-ghost" onClick={() => test(a)} title="Send test"><Icon name="play" size={13} /></button>}
                  {can("manager") && <button className="btn btn-sm btn-ghost btn-danger" onClick={() => del(a)} title="Delete"><Icon name="trash" size={14} /></button>}
                </div>
              </div>
            )) : <EmptyState icon="bell" title="No alerts" body="Create a price or P/L alert to start monitoring." />}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Fired events</h3><span className="sub">live feed</span></div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {events?.length ? events.map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 12, padding: "10px 4px", borderBottom: "1px solid var(--line)" }}>
                <span className={`badge ${e.acknowledgedAt ? "muted" : "warn"}`} style={{ alignSelf: "flex-start" }}><Icon name="bell" size={12} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{e.message}</div>
                  <div style={{ fontSize: 11, color: "var(--faint)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{timeAgo(e.firedAt)}{e.acknowledgedAt ? " · acknowledged" : ""}</div>
                </div>
                {!e.acknowledgedAt && can("analyst") && <button className="btn btn-sm btn-ghost" onClick={() => ack(e)} title="Acknowledge"><Icon name="check" size={14} /></button>}
              </div>
            )) : <EmptyState icon="check" title="Nothing fired" body="Triggered alerts will stream in here." />}
          </div>
        </div>
      </div>

      {creating && <CreateAlert onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      <style>{css}</style>
    </>
  );
}

function CreateAlert({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data: assets } = useData<Asset[]>("/assets");
  const { data: portfolios } = useData<PortfolioSummary[]>("/portfolios");
  const [f, setF] = useState({ kind: "price_below", assetId: "", portfolioId: "", threshold: "", currency: "USD", cooldownMin: 60, channels: ["inapp"] as string[] });
  const [busy, setBusy] = useState(false);
  const kind = KINDS.find((k) => k.v === f.kind)!;

  const submit = async () => {
    if (!f.threshold) return toast("warn", "Threshold required");
    const body: any = { kind: f.kind, threshold: f.threshold, currency: f.currency, cooldownMin: f.cooldownMin, channels: f.channels };
    if (kind.target === "asset") { if (!f.assetId) return toast("warn", "Pick an asset"); body.assetId = f.assetId; }
    else { if (!f.portfolioId) return toast("warn", "Pick a portfolio"); body.portfolioId = f.portfolioId; }
    setBusy(true);
    try { await api.post("/alerts", body); toast("success", "Alert created"); onDone(); }
    catch (e: any) { toast("error", "Failed", e.message); } finally { setBusy(false); }
  };
  const toggleCh = (c: string) => setF({ ...f, channels: f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c] });

  return (
    <Modal title="New alert" sub="Fires once when the condition becomes true, then waits for cooldown." onClose={onClose} wide
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create alert"}</button></>}>
      <Field label="Condition"><select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}</select></Field>
      <div className="form-grid">
        {kind.target === "asset" ? (
          <Field label="Asset"><select className="select" value={f.assetId} onChange={(e) => setF({ ...f, assetId: e.target.value })}><option value="">Select…</option>{assets?.map((a) => <option key={a.id} value={a.id}>{a.symbol} — {a.name}</option>)}</select></Field>
        ) : (
          <Field label="Portfolio"><select className="select" value={f.portfolioId} onChange={(e) => setF({ ...f, portfolioId: e.target.value })}><option value="">Select…</option>{portfolios?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        )}
        <Field label={kind.unit === "%" ? "Threshold (%)" : `Threshold (${f.currency})`} hint={f.kind === "pnl" || f.kind === "pct_change" ? "Use a negative number for downside alerts." : undefined}>
          <input className="input mono" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} placeholder={kind.unit === "%" ? "-10" : "60000"} />
        </Field>
        {kind.unit !== "%" && <Field label="Currency"><select className="select" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{["USD", "EUR", "GBP", "AZN", "TRY"].map((c) => <option key={c}>{c}</option>)}</select></Field>}
        <Field label="Cooldown (minutes)"><input className="input mono" type="number" value={f.cooldownMin} onChange={(e) => setF({ ...f, cooldownMin: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Channels">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ALL_CHANNELS.map(([v, label]) => (
            <button key={v} type="button" className={`chip-toggle ${f.channels.includes(v) ? "on" : ""}`} onClick={() => toggleCh(v)}>{label}</button>
          ))}
        </div>
      </Field>
    </Modal>
  );
}

const css = `
.alert-row { display: flex; align-items: center; gap: 14px; padding: 12px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); transition: border-color var(--dur-fast); }
.alert-row:hover { border-color: var(--line-strong); }
.alert-row.off { opacity: 0.6; }
.switch { width: 38px; height: 22px; border-radius: 99px; background: var(--surface-3); border: 1px solid var(--line-strong); position: relative; flex-shrink: 0; transition: background var(--dur); padding: 0; }
.switch span { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--muted); transition: transform var(--dur) var(--ease), background var(--dur); }
.switch.on { background: var(--accent-soft); border-color: var(--accent); }
.switch.on span { transform: translateX(16px); background: var(--accent); }
.switch:disabled { cursor: not-allowed; }
.chip-toggle { padding: 7px 14px; border-radius: var(--r-pill); border: 1px solid var(--line-strong); background: var(--surface); color: var(--muted); font-size: 12.5px; font-weight: 600; transition: all var(--dur-fast); }
.chip-toggle.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
`;
