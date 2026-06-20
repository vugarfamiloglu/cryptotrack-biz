import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../hooks/useData";
import { useLive } from "../providers/live";
import { useAuth } from "../providers/auth";
import { useToast } from "../providers/toast";
import { api, type PortfolioSummary } from "../api";
import { PL, Money, Spinner, EmptyState, Modal, Field } from "../components/ui";
import { Icon } from "../components/Icon";
import { money, pct, compact } from "../format";

export function Portfolios() {
  const live = useLive();
  const { can } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, reload } = useData<PortfolioSummary[]>("/portfolios", [live.asOf]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", baseCurrency: "USD" });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!form.name.trim()) return toast("warn", "Name required", "Give the portfolio a name.");
    setBusy(true);
    try {
      await api.post("/portfolios", form);
      toast("success", "Portfolio created", form.name);
      setCreating(false); setForm({ name: "", description: "", baseCurrency: "USD" }); reload();
    } catch (e: any) { toast("error", "Could not create", e.message); }
    finally { setBusy(false); }
  };

  if (loading && !data) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div><h1>Portfolios</h1><p>Each portfolio values independently with the org's cost-basis method.</p></div>
        {can("manager") && <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New portfolio</button>}
      </div>

      {!data?.length ? (
        <EmptyState icon="wallet" title="No portfolios yet" body="Create your first portfolio to start tracking holdings and P/L."
          action={can("manager") && <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New portfolio</button>} />
      ) : (
        <div className="pf-grid">
          {data.map((p) => {
            const upl = Number(p.unrealizedPnL);
            return (
              <button key={p.id} className="pf-card" onClick={() => nav(`/portfolios/${p.id}`)}>
                <div className="pf-top">
                  <div>
                    <div className="pf-name">{p.name}{p.archivedAt && <span className="badge muted" style={{ marginLeft: 8 }}>archived</span>}</div>
                    <div className="pf-desc">{p.description || "—"}</div>
                  </div>
                  <span className="asset-sym" style={{ width: 32, height: 32 }}><Icon name="wallet" size={16} /></span>
                </div>
                <div className="pf-nav"><Money value={p.marketValue} currency={p.baseCurrency} /></div>
                <div className="pf-meta">
                  <span><PL value={p.unrealizedPnL} currency={p.baseCurrency} /> <PL value={p.unrealizedPct} asPct /></span>
                  <span style={{ color: "var(--faint)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{p.positionsCount} positions</span>
                </div>
                <div className="pf-bar"><div className="pf-bar-fill" style={{ width: `${Math.min(100, Math.abs(upl) / (Number(p.costBasis) || 1) * 100)}%`, background: upl >= 0 ? "var(--pos)" : "var(--neg)" }} /></div>
              </button>
            );
          })}
        </div>
      )}

      {creating && (
        <Modal title="New portfolio" sub="Group related holdings under a treasury book." onClose={() => setCreating(false)}
          footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn btn-primary" onClick={create} disabled={busy}>{busy ? "Creating…" : "Create portfolio"}</button></>}>
          <Field label="Name"><input className="input" value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Treasury Core" /></Field>
          <Field label="Description" hint="Optional — what this book holds."><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Long-term reserve" /></Field>
          <Field label="Base currency">
            <select className="select" value={form.baseCurrency} onChange={(e) => setForm({ ...form, baseCurrency: e.target.value })}>
              {["USD", "EUR", "GBP", "AZN", "TRY"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </Modal>
      )}

      <style>{css}</style>
    </>
  );
}

const css = `
.pf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--s5); }
.pf-card { text-align: left; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); padding: var(--s5); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: var(--s3); transition: transform var(--dur) var(--ease), border-color var(--dur), box-shadow var(--dur); cursor: pointer; }
.pf-card:hover { transform: translateY(-3px); border-color: var(--accent); box-shadow: var(--shadow-md); }
.pf-top { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s3); }
.pf-name { font-family: var(--font-display); font-weight: 600; font-size: 15.5px; }
.pf-desc { color: var(--muted); font-size: 12.5px; margin-top: 2px; max-width: 30ch; }
.pf-nav { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
.pf-meta { display: flex; justify-content: space-between; align-items: center; }
.pf-bar { height: 5px; border-radius: 99px; background: var(--surface-3); overflow: hidden; }
.pf-bar-fill { height: 100%; border-radius: 99px; transition: width var(--dur) var(--ease); }
`;
