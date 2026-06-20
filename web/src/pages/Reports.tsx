import { useState } from "react";
import { useData } from "../hooks/useData";
import { api, type PortfolioSummary } from "../api";
import { Money, PL, Spinner, EmptyState } from "../components/ui";
import { Icon } from "../components/Icon";

const METHODS = ["FIFO", "AVG", "HIFO", "LIFO"];
const CCYS = ["USD", "EUR", "GBP", "AZN", "TRY"];

export function Reports() {
  const { data, loading } = useData<PortfolioSummary[]>("/portfolios");
  const [method, setMethod] = useState("FIFO");
  const [ccy, setCcy] = useState("USD");
  const dl = (id: string, fmt: "csv" | "pdf") => api.download(`/portfolios/${id}/report.${fmt}?method=${method}&currency=${ccy}`);

  if (loading && !data) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div><h1>Statements &amp; Reports</h1><p>Export a holdings statement per portfolio. Reports are computed at the chosen method and currency.</p></div>
        <div className="head-actions">
          <div className="pill-tabs">{METHODS.map((m) => <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{m}</button>)}</div>
          <select className="select" style={{ width: 90 }} value={ccy} onChange={(e) => setCcy(e.target.value)}>{CCYS.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
      </div>

      {!data?.length ? <EmptyState icon="report" title="No portfolios to export" /> : (
        <div className="card">
          <table className="tbl">
            <thead><tr><th>Portfolio</th><th className="num">Market value</th><th className="num">Unrealized P/L</th><th className="num">Statements</th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td><b style={{ fontWeight: 600 }}>{p.name}</b><div style={{ color: "var(--muted)", fontSize: 12 }}>{p.positionsCount} positions</div></td>
                  <td className="num mono"><Money value={p.marketValue} currency={ccy} /></td>
                  <td className="num"><PL value={p.unrealizedPnL} currency={ccy} /></td>
                  <td className="num">
                    <div className="row-actions">
                      <button className="btn btn-sm" onClick={() => dl(p.id, "csv")}><Icon name="download" size={14} /> CSV</button>
                      <button className="btn btn-sm" onClick={() => dl(p.id, "pdf")}><Icon name="report" size={14} /> PDF</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ color: "var(--faint)", fontSize: 12, marginTop: 16 }}>
        <Icon name="info" size={13} /> Reports reflect public market prices and are analytical only — not custody records or investment advice.
      </p>
    </>
  );
}
