import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { money, signed, pct, plClass } from "../format";

/** Semantic-colored P/L value (the only place green/red is allowed). */
export function PL({ value, currency, asPct, showSign = true }: { value: string | number; currency?: string; asPct?: boolean; showSign?: boolean }) {
  const cls = plClass(value);
  const text = asPct ? pct(value) : showSign ? (currency ? `${Number(value) >= 0 ? "+" : "-"}${money(Math.abs(Number(value)), currency)}` : signed(value)) : money(value, currency);
  return <span className={`mono ${cls}`}>{text}</span>;
}

export function Money({ value, currency = "USD", dp }: { value: string | number; currency?: string; dp?: number }) {
  return <span className="mono">{money(value, currency, dp)}</span>;
}

/** Tiny inline sparkline (SVG, no deps). */
export function Sparkline({ data, color = "var(--accent)", w = 120, h = 30 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / span) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PasswordInput({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <input className="input" type={show ? "text" : "password"} value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="eye" tabIndex={-1} onClick={() => setShow((s) => !s)} aria-label={show ? "Hide" : "Show"}>
        <Icon name={show ? "eyeOff" : "eye"} size={17} />
      </button>
    </div>
  );
}

export function AssetChip({ symbol, name }: { symbol: string; name?: string }) {
  return (
    <span className="asset-chip">
      <span className="asset-sym">{symbol.slice(0, 4)}</span>
      <span>{name ? <b style={{ fontWeight: 600 }}>{symbol}</b> : symbol}{name && <span style={{ color: "var(--muted)", marginLeft: 6, fontSize: 12 }}>{name}</span>}</span>
    </span>
  );
}

export function Modal({ title, sub, children, onClose, footer, wide }: { title: string; sub?: string; children: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function EmptyState({ icon = "info", title, body, action }: { icon?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h4>{title}</h4>
      {body && <p style={{ margin: "0 auto", maxWidth: "44ch" }}>{body}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{ display: "grid", placeItems: "center", padding: 60 }}>
      <svg width="34" height="34" viewBox="0 0 50 50" style={{ animation: "spin 0.9s linear infinite" }}>
        <circle cx="25" cy="25" r="20" fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle cx="25" cy="25" r="20" fill="none" stroke="var(--accent)" strokeWidth="5" strokeDasharray="80 50" strokeLinecap="round" />
      </svg>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
