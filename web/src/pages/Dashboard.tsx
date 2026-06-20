import { Link } from "react-router-dom";
import { useData } from "../hooks/useData";
import { useLive } from "../providers/live";
import { type Dashboard as Dash } from "../api";
import { DonutChart, BarChart, PALETTE } from "../components/charts";
import { PL, Money, Spinner, EmptyState } from "../components/ui";
import { Icon } from "../components/Icon";
import { money, compact, pct, plClass, timeAgo } from "../format";

export function Dashboard() {
  const live = useLive();
  const { data, loading } = useData<Dash>("/dashboard", [live.asOf, live.alertTick]);

  if (loading && !data) return <Spinner />;
  if (!data) return <EmptyState title="No data yet" body="Add a portfolio and some transactions to populate the treasury dashboard." />;

  const { totals, baseCurrency: ccy, allocation, movers, portfolios, recentAlerts, counts } = data;

  const kpis = [
    { label: "Net Asset Value", value: money(totals.marketValue, ccy), sub: <>Cost basis <Money value={totals.costBasis} currency={ccy} /></>, icon: "wallet", accent: true },
    { label: "Unrealized P/L", value: <PL value={totals.unrealizedPnL} currency={ccy} />, sub: <PL value={totals.unrealizedPct} asPct />, icon: Number(totals.unrealizedPnL) >= 0 ? "trendUp" : "trendDown" },
    { label: "Realized P/L", value: <PL value={totals.realizedPnL} currency={ccy} />, sub: <span className="mono" style={{ color: "var(--muted)" }}>lifetime disposals</span>, icon: "ledger" },
    { label: "Active monitoring", value: <span className="mono">{counts.alerts}</span>, sub: <span style={{ color: "var(--muted)" }}>{counts.portfolios} portfolios · {counts.transactions} txns</span>, icon: "bell" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Treasury Overview</h1>
          <p>{data.method} cost basis · valued in {ccy} · {live.asOf ? `priced ${timeAgo(live.asOf)}` : "awaiting first price tick"}</p>
        </div>
        <Link to="/reports" className="btn"><Icon name="download" /> Statements</Link>
      </div>

      <div className="kpi-row" style={{ marginBottom: "var(--s5)" }}>
        {kpis.map((k) => (
          <div key={k.label} className={`kpi ${k.accent ? "accentbar" : ""}`}>
            <div className="k-label"><Icon name={k.icon} size={13} /> {k.label}</div>
            <div className="k-value">{k.value}</div>
            <div className="k-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="bento" style={{ marginBottom: "var(--s5)" }}>
        <div className="card">
          <div className="card-head"><h3>Allocation by asset</h3><span className="sub">{ccy}</span></div>
          <div className="card-pad" style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: "var(--s5)", alignItems: "center" }}>
            {allocation.length ? (
              <>
                <div className="chart-box" style={{ height: 220 }}>
                  <DonutChart labels={allocation.map((a) => a.symbol)} values={allocation.map((a) => Number(a.marketValue))} />
                </div>
                <div className="legend" style={{ flexDirection: "column", gap: 10, marginTop: 0 }}>
                  {allocation.map((a, i) => (
                    <div key={a.assetId} className="li" style={{ justifyContent: "space-between", width: "100%" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="sw" style={{ background: PALETTE[i % PALETTE.length] }} />
                        <b style={{ color: "var(--ink)", fontWeight: 600 }}>{a.symbol}</b>
                        <span style={{ color: "var(--faint)" }}>{a.name}</span>
                      </span>
                      <span className="mono" style={{ color: "var(--ink-2)" }}>{pct(a.allocationPct, 1)} · {compact(a.marketValue, ccy)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <EmptyState title="No holdings" body="Record buys to see allocation." />}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>24h movers</h3><span className="sub">live</span></div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {movers.length ? movers.map((m) => (
              <div key={m.symbol} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 6px", borderBottom: "1px solid var(--line)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="asset-sym">{m.symbol.slice(0, 4)}</span>
                  <span><b style={{ fontWeight: 600 }}>{m.symbol}</b><br /><span style={{ color: "var(--faint)", fontSize: 12 }}>{m.name}</span></span>
                </span>
                <span className={`badge ${m.change24h >= 0 ? "pos" : "neg"}`}>
                  <Icon name={m.change24h >= 0 ? "trendUp" : "trendDown"} size={12} /> {pct(m.change24h)}
                </span>
              </div>
            )) : <EmptyState title="No price moves" body="Movers appear once prices stream in." />}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Value by portfolio</h3><span className="sub">{ccy}</span></div>
          <div className="card-pad">
            {portfolios.length ? (
              <div className="chart-box"><BarChart labels={portfolios.map((p) => p.name)} values={portfolios.map((p) => Number(p.marketValue))} horizontal /></div>
            ) : <EmptyState title="No portfolios" />}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Recent alert activity</h3><Link to="/alerts" className="crumblink" style={{ fontSize: 12 }}>View all</Link></div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recentAlerts.length ? recentAlerts.map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 12, padding: "10px 6px", borderBottom: "1px solid var(--line)" }}>
                <span className="badge warn" style={{ alignSelf: "flex-start" }}><Icon name="bell" size={12} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{a.message}</div>
                  <div style={{ fontSize: 11, color: "var(--faint)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                    {timeAgo(a.firedAt)}{a.acknowledgedAt ? " · acknowledged" : ""}
                  </div>
                </div>
              </div>
            )) : <EmptyState icon="bell" title="No alerts fired" body="Triggered price and P/L alerts will appear here." />}
          </div>
        </div>
      </div>
    </>
  );
}
