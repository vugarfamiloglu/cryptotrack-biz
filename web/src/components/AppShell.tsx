import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import { useAuth } from "../providers/auth";
import { useLive } from "../providers/live";
import { useTheme } from "../providers/theme";
import { useDialogs } from "../providers/dialogs";
import { api, type Dashboard } from "../api";
import { compact, pct, plClass, timeAgo } from "../format";

interface Header { crumb: string; title: string; subtitle?: string; }
const HeaderCtx = createContext<(h: Partial<Header> | null) => void>(() => {});
export const useSetHeader = (h: Partial<Header> | null, deps: unknown[] = []) => {
  const set = useContext(HeaderCtx);
  useEffect(() => { set(h); return () => set(null); /* eslint-disable-next-line */ }, deps);
};

const NAV = [
  { group: "Treasury", items: [
    { to: "/", icon: "dashboard", label: "Dashboard", end: true },
    { to: "/portfolios", icon: "wallet", label: "Portfolios" },
    { to: "/transactions", icon: "ledger", label: "Transactions" },
    { to: "/alerts", icon: "bell", label: "Alerts" },
  ]},
  { group: "Market", items: [
    { to: "/assets", icon: "coins", label: "Assets" },
    { to: "/reports", icon: "report", label: "Reports" },
  ]},
  { group: "Organization", items: [
    { to: "/audit", icon: "shield", label: "Audit log" },
    { to: "/logs", icon: "terminal", label: "Activity logs" },
    { to: "/settings", icon: "settings", label: "Settings" },
  ]},
];

function deriveHeader(path: string): Header {
  if (path === "/") return { crumb: "OVERVIEW", title: "Treasury Dashboard", subtitle: "Consolidated holdings & P/L" };
  if (path.startsWith("/portfolios")) return { crumb: "HOLDINGS", title: "Portfolios" };
  if (path.startsWith("/transactions")) return { crumb: "LEDGER", title: "Transactions" };
  if (path.startsWith("/alerts")) return { crumb: "MONITORING", title: "Price & P/L Alerts" };
  if (path.startsWith("/assets")) return { crumb: "MARKET", title: "Tracked Assets" };
  if (path.startsWith("/reports")) return { crumb: "EXPORTS", title: "Statements & Reports" };
  if (path.startsWith("/audit")) return { crumb: "GOVERNANCE", title: "Audit Log" };
  if (path.startsWith("/logs")) return { crumb: "SYSTEM", title: "Activity Logs" };
  if (path.startsWith("/settings")) return { crumb: "CONFIG", title: "Settings" };
  return { crumb: "TREASURY", title: "CryptoTrack Biz" };
}

const Brand = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17l5-5 4 3 6-7" /><path d="M14 8h4v4" /><path d="M3 21h18" />
  </svg>
);

export function AppShell() {
  const { session, logout, can } = useAuth();
  const live = useLive();
  const { theme, toggle } = useTheme();
  const { confirm } = useDialogs();
  const loc = useLocation();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("ctb-collapsed") === "1");
  const [override, setOverride] = useState<Partial<Header> | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [navTotal, setNavTotal] = useState<{ value: string; pct: string; ccy: string } | null>(null);
  const wbRef = useRef<HTMLElement>(null);

  useEffect(() => { setOverride(null); }, [loc.pathname]);
  useEffect(() => { localStorage.setItem("ctb-collapsed", collapsed ? "1" : "0"); }, [collapsed]);

  useEffect(() => {
    let alive = true;
    api.get<Dashboard>("/dashboard")
      .then((d) => alive && setNavTotal({ value: d.totals.marketValue, pct: d.totals.unrealizedPct, ccy: d.baseCurrency }))
      .catch(() => {});
    return () => { alive = false; };
  }, [live.asOf, loc.pathname]);

  const head = { ...deriveHeader(loc.pathname), ...override };
  const visibleNav = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !(["/audit", "/settings"].includes(i.to) && !can("manager"))),
  })).filter((g) => g.items.length);

  const onSignOut = async () => {
    if (await confirm({ title: "Sign out?", body: "You'll need to enter your credentials again to return to the terminal.", confirmLabel: "Sign out", danger: false })) {
      await logout(); nav("/login");
    }
  };

  return (
    <HeaderCtx.Provider value={setOverride}>
      <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
        <aside className="sidebar">
          <div className="sb-brand">
            <div className="sb-logo"><Brand /></div>
            <div className="sb-word"><b>CryptoTrack</b><span>Treasury</span></div>
          </div>
          <nav className="sb-nav">
            {visibleNav.map((g) => (
              <div key={g.group}>
                <div className="nav-group-label">{collapsed ? "•" : g.group}</div>
                {g.items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={(i as any).end} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} title={i.label}>
                    <Icon name={i.icon} />
                    <span className="nav-label">{i.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="sb-foot">{collapsed ? "·" : "Non-custodial · read-only analytics"}</div>
          <button className="collapse-tab" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar" title="Collapse">
            <Icon name="chevLeft" />
          </button>
        </aside>

        <header className={`topbar ${scrolled ? "scrolled" : ""}`}>
          <div className="tb-mark"><Brand /></div>
          <span className="tb-chev">›</span>
          <div className="tb-crumbtitle">
            <span className="tb-crumb">{head.crumb}</span>
            <span className="tb-title">{head.title}</span>
          </div>
          {head.subtitle && <span className="tb-sub">{head.subtitle}</span>}

          <div className="tb-ticker" title={live.asOf ? `Priced ${timeAgo(live.asOf)}` : "Awaiting prices"}>
            <span className="dot" />
            <span className="lbl">Net Asset Value</span>
            <span className="val">{navTotal ? compact(navTotal.value, navTotal.ccy) : "—"}</span>
            {navTotal && <span className={`chg ${plClass(navTotal.pct)}`}>{pct(navTotal.pct)}</span>}
          </div>

          <div className="tb-right">
            <span className="badge muted" style={{ textTransform: "uppercase" }}>{session?.role}</span>
            <button className="icon-btn" onClick={toggle} aria-label="Toggle theme" title="Theme">
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
            <button className="icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <Icon name="logout" />
            </button>
          </div>
        </header>

        <main className="workbench" ref={wbRef} onScroll={(e) => setScrolled((e.target as HTMLElement).scrollTop > 8)}>
          <div className="wb-inner"><Outlet /></div>
        </main>
      </div>
    </HeaderCtx.Provider>
  );
}
