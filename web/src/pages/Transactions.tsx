import { useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../hooks/useData";
import { useAuth } from "../providers/auth";
import { useToast } from "../providers/toast";
import { useDialogs } from "../providers/dialogs";
import { api, type Tx, type PortfolioSummary } from "../api";
import { DataTable, type Column } from "../components/DataTable";
import { Spinner, EmptyState } from "../components/ui";
import { Icon } from "../components/Icon";
import { money, qty as fmtQty, dateStr } from "../format";

const TYPE_BADGE: Record<string, string> = { buy: "pos", sell: "neg", airdrop: "indigo", reward: "indigo", transfer_in: "muted", transfer_out: "muted", fee: "warn" };

interface OrgTx extends Tx { portfolioId: string; portfolioName: string; }

export function Transactions() {
  const { can } = useAuth();
  const toast = useToast();
  const { confirm } = useDialogs();
  const [pf, setPf] = useState("");
  const { data: portfolios } = useData<PortfolioSummary[]>("/portfolios");
  const { data: txs, loading, reload } = useData<OrgTx[]>(`/transactions${pf ? `?portfolio=${pf}` : ""}`, [pf]);

  const reverse = async (t: OrgTx) => {
    if (t.reversesId) return;
    if (await confirm({ title: "Reverse this transaction?", body: `A balancing entry will be appended to ${t.portfolioName}. The ledger stays immutable.`, confirmLabel: "Post reversal" })) {
      try { await api.post(`/transactions/${t.id}/reverse`); toast("success", "Reversal posted"); reload(); }
      catch (e: any) { toast("error", "Reverse failed", e.message); }
    }
  };

  const cols: Column<OrgTx>[] = [
    { key: "executedAt", label: "Date", width: 110, render: (r) => dateStr(r.executedAt) },
    { key: "portfolioName", label: "Portfolio", width: 150, render: (r) => <Link to={`/portfolios/${r.portfolioId}`} className="crumblink">{r.portfolioName}</Link> },
    { key: "type", label: "Type", width: 115, render: (r) => <span className={`badge ${TYPE_BADGE[r.type] || "muted"}`}>{r.type.replace("_", " ")}</span> },
    { key: "symbol", label: "Asset", width: 80, render: (r) => <b>{r.symbol}</b> },
    { key: "quantity", label: "Quantity", num: true, width: 120, render: (r) => fmtQty(r.quantity) },
    { key: "unitPrice", label: "Unit price", num: true, width: 110, render: (r) => money(r.unitPrice, r.currency) },
    { key: "fee", label: "Fee", num: true, width: 90, render: (r) => money(r.fee, r.currency) },
    { key: "author", label: "By", width: 120, render: (r) => <span style={{ color: "var(--muted)" }}>{r.author || "—"}</span> },
    { key: "act", label: "", width: 80, num: true, render: (r) => can("analyst") && (r.reversesId ? <span className="badge muted">reversal</span> : <button className="btn btn-sm btn-ghost" onClick={() => reverse(r)} title="Reverse"><Icon name="reverse" size={14} /></button>) },
  ];

  if (loading && !txs) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div><h1>Transaction Ledger</h1><p>Immutable, append-only record across all portfolios. Corrections post balancing reversals.</p></div>
        <select className="select" style={{ width: 210 }} value={pf} onChange={(e) => setPf(e.target.value)}>
          <option value="">All portfolios</option>
          {portfolios?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="card">
        <DataTable columns={cols} rows={txs || []} rowKey={(r) => r.id}
          empty={<EmptyState icon="ledger" title="No transactions" body="Open a portfolio to add or import transactions."
            action={<Link to="/portfolios" className="btn">Go to portfolios</Link>} />} />
      </div>
    </>
  );
}
