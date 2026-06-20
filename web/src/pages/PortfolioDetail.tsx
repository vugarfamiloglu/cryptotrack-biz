import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useData } from "../hooks/useData";
import { useLive } from "../providers/live";
import { useAuth } from "../providers/auth";
import { useToast } from "../providers/toast";
import { useDialogs } from "../providers/dialogs";
import { useSetHeader } from "../components/AppShell";
import { api, type ValuationResp, type Tx, type Asset } from "../api";
import { DataTable, type Column } from "../components/DataTable";
import { PL, Money, Spinner, EmptyState, Modal, Field, AssetChip } from "../components/ui";
import { Icon } from "../components/Icon";
import { money, qty as fmtQty, pct, dateStr, dateTimeStr } from "../format";

const METHODS = ["FIFO", "AVG", "HIFO", "LIFO"];
const TX_TYPES = ["buy", "sell", "transfer_in", "transfer_out", "airdrop", "reward", "fee"];
const CCYS = ["USD", "EUR", "GBP", "AZN", "TRY"];
const TYPE_BADGE: Record<string, string> = { buy: "pos", sell: "neg", airdrop: "indigo", reward: "indigo", transfer_in: "muted", transfer_out: "muted", fee: "warn" };

export function PortfolioDetail() {
  const { id } = useParams();
  const live = useLive();
  const { can } = useAuth();
  const toast = useToast();
  const { confirm } = useDialogs();
  const [method, setMethod] = useState("FIFO");
  const [ccy, setCcy] = useState("");
  const [tab, setTab] = useState<"positions" | "transactions">("positions");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const q = `method=${method}${ccy ? `&currency=${ccy}` : ""}`;
  const { data: val, loading } = useData<ValuationResp>(`/portfolios/${id}?${q}`, [method, ccy, live.asOf]);
  const { data: txs, reload: reloadTx } = useData<Tx[]>(`/transactions/portfolio/${id}`);
  const { data: assets } = useData<Asset[]>("/assets");

  useSetHeader(val ? { crumb: "HOLDINGS", title: val.portfolio.name, subtitle: `${method} · ${val.displayCurrency}` } : null, [val?.portfolio.name, method]);

  const reloadAll = () => { reloadTx(); };
  const dl = (fmt: "csv" | "pdf") => api.download(`/portfolios/${id}/report.${fmt}?${q}`);

  const reverse = async (t: Tx) => {
    if (t.reversesId) return;
    if (await confirm({ title: "Reverse this transaction?", body: `A balancing entry will be appended (the ledger is immutable). This affects valuation for ${t.symbol}.`, confirmLabel: "Post reversal" })) {
      try { await api.post(`/transactions/${t.id}/reverse`); toast("success", "Reversal posted", `${t.type} ${t.symbol}`); reloadAll(); }
      catch (e: any) { toast("error", "Reverse failed", e.message); }
    }
  };

  if (loading && !val) return <Spinner />;
  if (!val) return <EmptyState title="Portfolio not found" action={<Link to="/portfolios" className="btn">Back to portfolios</Link>} />;

  const t = val.totals, dc = val.displayCurrency;
  const posCols: Column<any>[] = [
    { key: "symbol", label: "Asset", width: 170, render: (p) => <AssetChip symbol={p.symbol} name={p.name} /> },
    { key: "qty", label: "Quantity", num: true, width: 120, render: (p) => fmtQty(p.qty) },
    { key: "avgCost", label: "Avg cost", num: true, width: 110, render: (p) => money(p.avgCost, dc) },
    { key: "price", label: "Price", num: true, width: 110, render: (p) => money(p.price, dc) },
    { key: "marketValue", label: "Market value", num: true, width: 130, render: (p) => money(p.marketValue, dc) },
    { key: "costBasis", label: "Cost basis", num: true, width: 120, render: (p) => money(p.costBasis, dc) },
    { key: "unrealizedPnL", label: "Unreal. P/L", num: true, width: 120, render: (p) => <PL value={p.unrealizedPnL} currency={dc} /> },
    { key: "unrealizedPct", label: "%", num: true, width: 80, render: (p) => <PL value={p.unrealizedPct} asPct /> },
    { key: "realizedPnL", label: "Realized", num: true, width: 110, render: (p) => <PL value={p.realizedPnL} currency={dc} /> },
    { key: "allocationPct", label: "Alloc", num: true, width: 80, render: (p) => pct(p.allocationPct, 1) },
    { key: "change24hPct", label: "24h", num: true, width: 80, render: (p) => p.change24hPct == null ? "—" : <PL value={p.change24hPct} asPct /> },
  ];
  const txCols: Column<Tx>[] = [
    { key: "executedAt", label: "Date", width: 110, render: (r) => dateStr(r.executedAt) },
    { key: "type", label: "Type", width: 120, render: (r) => <span className={`badge ${TYPE_BADGE[r.type] || "muted"}`}>{r.type.replace("_", " ")}</span> },
    { key: "symbol", label: "Asset", width: 90, render: (r) => <b>{r.symbol}</b> },
    { key: "quantity", label: "Quantity", num: true, width: 120, render: (r) => fmtQty(r.quantity) },
    { key: "unitPrice", label: "Unit price", num: true, width: 110, render: (r) => money(r.unitPrice, r.currency) },
    { key: "fee", label: "Fee", num: true, width: 90, render: (r) => money(r.fee, r.currency) },
    { key: "author", label: "By", width: 130, render: (r) => <span style={{ color: "var(--muted)" }}>{r.author || "—"}</span> },
    { key: "act", label: "", width: 90, num: true, render: (r) => can("analyst") && (r.reversesId ? <span className="badge muted">reversal</span> : <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); reverse(r); }} title="Reverse"><Icon name="reverse" size={14} /></button>) },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/portfolios" className="crumblink" style={{ fontSize: 12 }}>← Portfolios</Link>
          <h1 style={{ marginTop: 4 }}>{val.portfolio.name}</h1>
          <p>{val.portfolio.description || "Holdings valuation and ledger."}</p>
        </div>
        <div className="head-actions">
          {can("analyst") && <button className="btn" onClick={() => setImporting(true)}><Icon name="upload" /> Import CSV</button>}
          {can("analyst") && <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" /> Add transaction</button>}
        </div>
      </div>

      <div className="kpi-row" style={{ marginBottom: "var(--s5)" }}>
        <div className="kpi accentbar"><div className="k-label"><Icon name="wallet" size={13} /> Market value</div><div className="k-value"><Money value={t.marketValue} currency={dc} /></div><div className="k-sub">Cost basis <Money value={t.costBasis} currency={dc} /></div></div>
        <div className="kpi"><div className="k-label"><Icon name="trendUp" size={13} /> Unrealized P/L</div><div className="k-value"><PL value={t.unrealizedPnL} currency={dc} /></div><div className="k-sub"><PL value={t.unrealizedPct} asPct /></div></div>
        <div className="kpi"><div className="k-label"><Icon name="ledger" size={13} /> Realized P/L</div><div className="k-value"><PL value={t.realizedPnL} currency={dc} /></div><div className="k-sub" style={{ color: "var(--muted)" }}>from disposals</div></div>
        <div className="kpi"><div className="k-label"><Icon name="coins" size={13} /> Positions</div><div className="k-value mono">{val.positions.filter((p: any) => Number(p.qty) > 0).length}</div><div className="k-sub" style={{ color: "var(--muted)" }}>{txs?.length ?? 0} ledger entries</div></div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="pill-tabs">
            <button className={tab === "positions" ? "on" : ""} onClick={() => setTab("positions")}>Positions</button>
            <button className={tab === "transactions" ? "on" : ""} onClick={() => setTab("transactions")}>Transactions</button>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginLeft: "auto" }}>
            <div className="pill-tabs" title="Cost-basis method">
              {METHODS.map((m) => <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{m}</button>)}
            </div>
            <select className="select" style={{ width: 90 }} value={ccy || val.baseCurrency} onChange={(e) => setCcy(e.target.value)} title="Display currency">
              {CCYS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button className="btn btn-sm" onClick={() => dl("csv")}><Icon name="download" size={14} /> CSV</button>
            <button className="btn btn-sm" onClick={() => dl("pdf")}><Icon name="report" size={14} /> PDF</button>
          </div>
        </div>
        <div style={{ padding: tab === "positions" ? 0 : 0 }}>
          {tab === "positions" ? (
            <DataTable columns={posCols} rows={val.positions.filter((p: any) => Number(p.qty) !== 0 || Number(p.realizedPnL) !== 0)} rowKey={(p: any) => p.assetId}
              empty={<EmptyState icon="coins" title="No positions" body="Add buy transactions to build positions." />} />
          ) : (
            <DataTable columns={txCols} rows={txs || []} rowKey={(r) => r.id}
              empty={<EmptyState icon="ledger" title="No transactions" body="The ledger is empty. Add or import transactions." />} />
          )}
        </div>
      </div>

      {adding && <AddTxModal portfolioId={id!} assets={assets || []} defaultCcy={val.baseCurrency} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reloadAll(); }} />}
      {importing && <ImportModal portfolioId={id!} onClose={() => setImporting(false)} onDone={() => { setImporting(false); reloadAll(); }} />}
    </>
  );
}

function AddTxModal({ portfolioId, assets, defaultCcy, onClose, onDone }: { portfolioId: string; assets: Asset[]; defaultCcy: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ type: "buy", assetId: assets[0]?.id || "", quantity: "", unitPrice: "", fee: "0", currency: defaultCcy, executedAt: new Date().toISOString().slice(0, 10), note: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.assetId) return toast("warn", "Pick an asset");
    if (!f.quantity || Number(f.quantity) <= 0) return toast("warn", "Quantity required");
    setBusy(true);
    try { await api.post("/transactions", { ...f, portfolioId }); toast("success", "Transaction added", `${f.type} ${f.quantity}`); onDone(); }
    catch (e: any) { toast("error", "Failed", e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add transaction" sub="Immutable ledger entry — corrections are made via reversals." onClose={onClose} wide
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Add to ledger"}</button></>}>
      <div className="form-grid">
        <Field label="Type"><select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TX_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></Field>
        <Field label="Asset"><select className="select" value={f.assetId} onChange={(e) => setF({ ...f, assetId: e.target.value })}>{assets.map((a) => <option key={a.id} value={a.id}>{a.symbol} — {a.name}</option>)}</select></Field>
        <Field label="Quantity"><input className="input mono" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} placeholder="0.00" /></Field>
        <Field label="Unit price" hint="Per-unit price in the trade currency."><input className="input mono" value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: e.target.value })} placeholder="0.00" /></Field>
        <Field label="Fee"><input className="input mono" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} placeholder="0" /></Field>
        <Field label="Currency"><select className="select" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CCYS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Executed at"><input className="input" type="date" value={f.executedAt} onChange={(e) => setF({ ...f, executedAt: e.target.value })} /></Field>
        <Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional memo" /></Field>
      </div>
    </Modal>
  );
}

function ImportModal({ portfolioId, onClose, onDone }: { portfolioId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [csv, setCsv] = useState("date,type,asset,quantity,unit_price,currency,fee,note\n2025-06-01,buy,BTC,0.5,62000,USD,25,Treasury buy");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ imported: number; skipped: number; errors: string[] }>(`/transactions/portfolio/${portfolioId}/import`, { csv });
      toast(r.imported ? "success" : "warn", `Imported ${r.imported} rows`, r.skipped ? `${r.skipped} skipped` : "All rows valid");
      onDone();
    } catch (e: any) { toast("error", "Import failed", e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Import transactions (CSV)" sub="Columns: date, type, asset (symbol or id), quantity, unit_price, currency, fee, note." onClose={onClose} wide
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? "Importing…" : "Import"}</button></>}>
      <textarea className="input mono" rows={10} value={csv} onChange={(e) => setCsv(e.target.value)} />
    </Modal>
  );
}
